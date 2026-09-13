// git for-each-ref --format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)%00%(upstream:remotename)%00%(upstream:remoteref) refs/heads/B refs/remotes/B
//
// The full upstream status family in ONE format: %(refname), %(objectname)
// (tip commit hash), and the %(upstream:*) atoms including %(upstream:track)
// — the ahead/behind/gone bracket string git prints for divergence state.
// %00 renders as a literal NUL byte (renderRef's %XX decoder), which callers
// use as a separator because arc branch names can contain anything else.
//
// Data comes from ONE `arc branch -a -vv --json` call: locals carry
// {"remote":"arcadia/users/darl/B"} (the upstream, exactly what
// %(upstream:short) asks for) and tip commit ids in {"commit":{"id":…}}.
// Track counts use the shared countRange (capped at COUNT_RANGE_CAP like the
// status ab headers — a count at the cap means "at least this many").
//
// Track semantics, byte-verified against native git:
//   in sync        → "" (empty, fields collapse to adjacent NULs)
//   ahead only     → "[ahead N]"
//   behind only    → "[behind N]"
//   both           → "[ahead N, behind M]"   (ahead first)
//   upstream set, remote ref missing → "[gone]"   (no arc log probing)
//   no upstream    → "" (all upstream:* atoms empty)
// Remote-tracking refs never have an upstream: their upstream:* atoms and
// track are always empty. Track counts are computed ONLY for refs actually
// matched by the patterns (never a bulk N+1 over all branches).
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), shared with for-each-ref-committerdate / -multi-pattern (same
// variadic shape) and the single-positional siblings. Mutual exclusion:
//   • Our refine REQUIRES %(upstream:track) or %(objectname) in the format —
//     placeholders outside every sibling's supported set → they never match
//     our argvs.
//   • committerdate requires %(committerdate:unix); multi-pattern requires
//     basic-only placeholders → both REJECT any format carrying
//     objectname/upstream:track (renderable(golden) fails) → hand off to us.
//   • Single-pattern siblings (heads/remotes/upstream-remotename) all
//     renderable-gate too: their supported sets exclude objectname and
//     upstream:track → they reject our formats even when the pattern count
//     overlaps.
// "%(upstream:track,short)" and ":nobracket" stay unsupported → learnable,
// like every other atom outside SUPPORTED.
import { countRange, definePath, isExecResult, ok } from "../core"
import { byRefname, entryRefname, listBranches, refMatches, renderRef, renderable, type BranchEntry } from "../refs"

/** Placeholders this path renders. */
const SUPPORTED = /^(HEAD|refname|refname:short|objectname|upstream|upstream:short|upstream:track|upstream:remotename|upstream:remoteref)$/

/** The atoms only this path owns — refine requires at least one present so
 * the basic/upstream-only siblings keep their fixtures. */
const REQUIRED = /%\((?:upstream:track|objectname)\)/

/** BranchEntry with the `-vv` upstream field. */
interface UpstreamEntry extends BranchEntry {
	remote?: string
}

/** git %(upstream:track) for a live upstream. */
const trackLine = (ahead: number, behind: number): string =>
	ahead && behind ? `[ahead ${ahead}, behind ${behind}]` : ahead ? `[ahead ${ahead}]` : behind ? `[behind ${behind}]` : ""

interface Row {
	refname: string
	current: boolean
	/** local branch name — undefined for remote-tracking rows */
	name?: string
	upstream: string
	objectname: string
	track: string
}

export default definePath({
	name: "for-each-ref-upstream-track",
	summary: "for-each-ref with %(upstream:track)/%(objectname) placeholders",
	spec: "for-each-ref --format=<fmt> <patterns...>",
	refine: (args) =>
		(args.list.patterns?.length ?? 0) >= 1 &&
		REQUIRED.test(args.pos.fmt!) &&
		renderable(args.pos.fmt!, SUPPORTED),

	async run(args, ctx) {
		const patterns = args.list.patterns ?? []
		const entries = await listBranches(ctx, "-a", "-vv")
		if (isExecResult(entries)) return entries
		const rows: Row[] = (entries as UpstreamEntry[])
			.map((e) => ({
				refname: entryRefname(e),
				current: !!e.current,
				name: e.local ? e.name : undefined,
				upstream: e.remote ?? "",
				objectname: e.commit?.id ?? "",
				track: "",
			}))
			.filter((r) => patterns.some((p) => refMatches(p, r.refname)))
			.sort(byRefname)

		// [gone] is decided from the same listing — upstream configured
		// (remote field set) but no matching remote-tracking entry. Only live
		// upstreams reach arc log for ahead/behind, so a never-pushed or
		// fully-pruned branch costs no extra subprocesses.
		const remoteNames = new Set(entries.filter((e) => !e.local).map((e) => e.name))
		const live: Row[] = []
		for (const r of rows) {
			if (!r.name || !r.upstream) continue
			if (!remoteNames.has(r.upstream)) r.track = "[gone]"
			else live.push(r)
		}
		const counted = await Promise.all(
			live.map((r) =>
				Promise.all([
					countRange(ctx, `${r.upstream}..${r.name!}`), // ahead of upstream
					countRange(ctx, `${r.name!}..${r.upstream}`), // behind upstream
				]),
			),
		)
		for (let i = 0; i < live.length; i++) {
			const [ahead, behind] = counted[i]!
			if (isExecResult(ahead)) return ahead
			if (isExecResult(behind)) return behind
			live[i]!.track = trackLine(ahead, behind)
		}

		return ok(
			rows
				.map((r) => {
					const slash = r.upstream.indexOf("/")
					const remotename = slash !== -1 ? r.upstream.slice(0, slash) : r.upstream
					const branchPart = slash !== -1 ? r.upstream.slice(slash + 1) : ""
					return (
						renderRef(args.pos.fmt!, r.refname, r.current, {
							objectname: r.objectname,
							upstream: r.upstream ? `refs/remotes/${r.upstream}` : "",
							"upstream:short": r.upstream,
							"upstream:track": r.track,
							"upstream:remotename": remotename,
							"upstream:remoteref": branchPart ? `refs/heads/${branchPart}` : "",
						}) + "\n"
					)
				})
				.join(""),
		)
	},

	fixtures: [
		{
			name: "full NUL-separated format: local matches, git-style remote name does not",
			argv: [
				"for-each-ref",
				"--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)%00%(upstream:remotename)%00%(upstream:remoteref)",
				"refs/heads/feature-x",
				"refs/remotes/feature-x",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "feature-x",
							current: true,
							remote: "arcadia/users/darl/feature-x",
							commit: { id: "9d4be32d34f68a92f05cc9747ce21f0aa39dae9c" },
						},
						{ name: "arcadia/users/darl/feature-x", commit: { id: "2c8e11776df403bda95e0d68f4a2b71c609f8e33" } },
					]),
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..feature-x": { stdout: "aaa\nbbb\n" },
				"log --format={commit} -n 1000 feature-x..arcadia/users/darl/feature-x": { stdout: "" },
			},
			want: {
				stdout:
					"refs/heads/feature-x\x00arcadia/users/darl/feature-x\x009d4be32d34f68a92f05cc9747ce21f0aa39dae9c\x00[ahead 2]\x00arcadia\x00refs/heads/users/darl/feature-x\n",
				code: 0,
			},
		},
		{
			name: "arcadia-shaped remote pattern matches too: ahead 1, behind 2 on both refs",
			argv: [
				"for-each-ref",
				"--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)%00%(upstream:remotename)%00%(upstream:remoteref)",
				"refs/heads/feature-x",
				"refs/remotes/arcadia/users/darl/feature-x",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "feature-x",
							remote: "arcadia/users/darl/feature-x",
							commit: { id: "9d4be32d34f68a92f05cc9747ce21f0aa39dae9c" },
						},
						{ name: "arcadia/users/darl/feature-x", commit: { id: "2c8e11776df403bda95e0d68f4a2b71c609f8e33" } },
					]),
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..feature-x": { stdout: "new1\n" },
				"log --format={commit} -n 1000 feature-x..arcadia/users/darl/feature-x": { stdout: "r1\nr2\n" },
			},
			want: {
				stdout:
					"refs/heads/feature-x\x00arcadia/users/darl/feature-x\x009d4be32d34f68a92f05cc9747ce21f0aa39dae9c\x00[ahead 1, behind 2]\x00arcadia\x00refs/heads/users/darl/feature-x\n" +
					"refs/remotes/arcadia/users/darl/feature-x\x00\x002c8e11776df403bda95e0d68f4a2b71c609f8e33\x00\x00\x00\n",
				code: 0,
			},
		},
		{
			name: "in sync: track empty, upstream fields collapse",
			argv: [
				"for-each-ref",
				"--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)%00%(upstream:remotename)%00%(upstream:remoteref)",
				"refs/heads/trunk",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "trunk",
							current: true,
							remote: "arcadia/trunk",
							commit: { id: "f310ab59fc77304d99efe6a2bc8e1d472a650341" },
						},
						{ name: "arcadia/trunk", commit: { id: "f310ab59fc77304d99efe6a2bc8e1d472a650341" } },
					]),
				},
				"log --format={commit} -n 1000 arcadia/trunk..trunk": { stdout: "" },
				"log --format={commit} -n 1000 trunk..arcadia/trunk": { stdout: "" },
			},
			want: {
				stdout:
					"refs/heads/trunk\x00arcadia/trunk\x00f310ab59fc77304d99efe6a2bc8e1d472a650341\x00\x00arcadia\x00refs/heads/trunk\n",
				code: 0,
			},
		},
		{
			name: "upstream configured but remote ref missing: [gone], no log counts",
			argv: ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads/topic/nested"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "topic/nested",
							remote: "arcadia/users/darl/topic/nested",
							commit: { id: "9d4be32d34f68a92f05cc9747ce21f0aa39dae9c" },
						},
						{ name: "arcadia/trunk", commit: { id: "2c8e11776df403bda95e0d68f4a2b71c609f8e33" } },
					]),
				},
			},
			want: { stdout: "topic/nested\t[gone]\n", code: 0 },
		},
		{
			name: "no upstream: all upstream atoms empty, no log counts",
			argv: [
				"for-each-ref",
				"--format=%(upstream:short)%09%(upstream:track)%09%(upstream:remotename)",
				"refs/heads/local-only",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "local-only", commit: { id: "9d4be32d34f68a92f05cc9747ce21f0aa39dae9c" } },
					]),
				},
			},
			want: { stdout: "\t\t\n", code: 0 },
		},
		{
			name: "remote-tracking ref: hash present, every upstream atom empty",
			argv: ["for-each-ref", "--format=%(refname)%00%(objectname)%00%(upstream:track)", "refs/remotes/arcadia/trunk"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ name: "arcadia/trunk", commit: { id: "f310ab59fc77304d99efe6a2bc8e1d472a650341" } },
					]),
				},
			},
			want: { stdout: "refs/remotes/arcadia/trunk\x00f310ab59fc77304d99efe6a2bc8e1d472a650341\x00\n", code: 0 },
		},
		{
			name: "mixed states across heads and remotes, sorted by full refname",
			argv: [
				"for-each-ref",
				"--format=%(refname:short)%09%(upstream:track)",
				"refs/heads",
				"refs/remotes",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "feature-x",
							remote: "arcadia/users/darl/feature-x",
							commit: { id: "9d4be32d34f68a92f05cc9747ce21f0aa39dae9c" },
						},
						{ local: true, name: "local-only", commit: { id: "f310ab59fc77304d99efe6a2bc8e1d472a650341" } },
						{ local: true, name: "trunk", remote: "arcadia/trunk", commit: { id: "2c8e11776df403bda95e0d68f4a2b71c609f8e33" } },
						{ name: "arcadia/trunk", commit: { id: "2c8e11776df403bda95e0d68f4a2b71c609f8e33" } },
						{ name: "arcadia/users/darl/feature-x", commit: { id: "44a1d9c0c8b3ff2e67d1e89305a7b6cf21a5449e" } },
					]),
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..feature-x": { stdout: "ahead1\n" },
				"log --format={commit} -n 1000 feature-x..arcadia/users/darl/feature-x": { stdout: "" },
				"log --format={commit} -n 1000 arcadia/trunk..trunk": { stdout: "" },
				"log --format={commit} -n 1000 trunk..arcadia/trunk": { stdout: "" },
			},
			want: {
				stdout: "feature-x\t[ahead 1]\nlocal-only\t\ntrunk\t\narcadia/trunk\t\narcadia/users/darl/feature-x\t\n",
				code: 0,
			},
		},
	],
})
