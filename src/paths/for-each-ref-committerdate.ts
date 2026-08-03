// git for-each-ref --format=%(refname:short)%09%(committerdate:unix) refs/heads refs/remotes
// Lists refs matching one or more patterns, formatted with %(...) placeholders
// including %(committerdate:unix) — the Unix-epoch committer timestamp.
// ONE `arc branch -a -v --json` call supplies branches AND their tip commit
// dates (`commit.date` per entry). Never fetch dates with per-ref `arc log`:
// t3code polls this command several times a second (readBranchRecency, 15s
// timeout) and a sequential N+1 over ~134 refs at ~120ms each took ~16s —
// every poll timed out and spammed the server log.
//
// Supported placeholders: %(HEAD) %(refname) %(refname:short)
// %(committerdate:unix) %(symref) and %XX byte escapes (%09 tab, %00 NUL,
// etc.). %(symref) always renders empty: arc has no symbolic branch refs
// (no arcadia/HEAD entry), and t3code's ref-snapshot parser only uses the
// column to SKIP symbolic refs (`if (symbolicTarget) continue`), so empty
// means every arc branch is kept — exactly git's output for plain refs.
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), same as for-each-ref-remotes and for-each-ref-heads.  The key
// disambiguator is the %(committerdate:unix) placeholder:
//   • Existing paths' SUPPORTED set excludes committerdate:unix, so their
//     refine REJECTS any format containing it → they hand off to us.
//   • Our refine REQUIRES %(committerdate:unix) to be present, so we REJECT
//     formats that only use HEAD/refname/refname:short — we never steal
//     their fixtures.
// Additionally, for-each-ref-remotes and for-each-ref-heads declare a single
// positional, so an argv with ≥2 patterns never structurally matches them;
// for-each-ref-sorted requires --sort, which our argv never carries.
import { definePath, isExecResult, ok } from "../core"
import { byRefname, entryRefname, isoToUnix, listBranches, refMatches, renderRef, renderable } from "../refs"

const SUPPORTED = /^(HEAD|refname|refname:short|committerdate:unix|symref)$/

export default definePath({
	name: "for-each-ref-committerdate",
	summary: "for-each-ref with %(committerdate:unix) and variadic patterns",
	spec: "for-each-ref --format=<fmt> <patterns...>",
	refine: (args) => /%\(committerdate:unix\)/.test(args.pos.fmt!) && renderable(args.pos.fmt!, SUPPORTED),

	async run(args, ctx) {
		const patterns = args.list.patterns ?? []
		const entries = await listBranches(ctx, "-a", "-v")
		if (isExecResult(entries)) return entries
		const refs = entries
			.map((e) => ({
				refname: entryRefname(e),
				current: !!e.current,
				unixDate: isoToUnix(e.commit?.date ?? ""),
			}))
			.filter((r) => patterns.some((p) => refMatches(p, r.refname)))
			.sort(byRefname)
		return ok(
			refs
				.map(
					(r) =>
						renderRef(args.pos.fmt!, r.refname, r.current, {
							"committerdate:unix": r.unixDate,
							symref: "", // arc branches are never symbolic
						}) + "\n",
				)
				.join(""),
		)
	},

	fixtures: [
		{
			name: "short refname + tab + unix committerdate for heads and remotes",
			argv: ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true, commit: { date: "2026-07-20T12:00:00+03:00" } },
						{ local: true, name: "trunk", commit: { date: "2026-07-21T09:30:00+03:00" } },
						{ name: "arcadia/trunk", commit: { date: "2026-07-21T09:30:00+03:00" } },
						{ name: "arcadia/users/darl/foo", commit: { date: "2026-07-19T18:00:00+03:00" } },
					]),
				},
			},
			want: {
				stdout:
					"dev\t1784538000\n" +
					"trunk\t1784615400\n" +
					"arcadia/trunk\t1784615400\n" +
					"arcadia/users/darl/foo\t1784473200\n",
				code: 0,
			},
		},
		{
			name: "t3code ref snapshot: full refname + unix date + empty symref column",
			argv: [
				"for-each-ref",
				"--format=%(refname)%09%(committerdate:unix)%09%(symref)",
				"refs/heads",
				"refs/remotes",
			],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true, commit: { date: "2026-07-20T12:00:00+03:00" } },
						{ local: true, name: "trunk", commit: { date: "2026-07-21T09:30:00+03:00" } },
						{ name: "arcadia/trunk", commit: { date: "2026-07-21T09:30:00+03:00" } },
					]),
				},
			},
			want: {
				stdout:
					"refs/heads/dev\t1784538000\t\n" +
					"refs/heads/trunk\t1784615400\t\n" +
					"refs/remotes/arcadia/trunk\t1784615400\t\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads/nonexistent"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true, commit: { date: "2026-07-21T09:30:00+03:00" } },
						{ name: "arcadia/trunk", commit: { date: "2026-07-21T09:30:00+03:00" } },
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
