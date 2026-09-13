// git for-each-ref --sort -committerdate --format %(refname)%00%(objectname)%00%(*objectname)
// Lists refs (default: all of them) with their tip object ids, NUL-separated
// for machine parsing, ordered by commit date (the "-" prefix = descending).
// Space-separated value forms are real git: `--sort <key>` and `--format <fmt>`.
//
// ONE `arc branch -a -v --json` call supplies branches AND their tip commit
// ids + dates (commit.id / commit.date per entry) — never a per-ref `arc log`
// N+1 (see src/refs.ts listBranches note and commit b6d0866).
//
// %(objectname) = the 40-hex tip commit hash. %(*objectname) = the PEELED
// object (what an annotated tag points at) — always EMPTY for refs/heads and
// refs/remotes because branch refs point directly at commits, and arc has no
// annotated tags; real git prints the same empty column for branch refs, so
// the byte shape matches. Dates compare as Unix seconds, not ISO strings:
// arc emits +03:00-style offsets, and mixed offsets order wrong
// lexicographically.
//
// Supported placeholders: %(HEAD) %(refname) %(refname:short) %(objectname)
// %(*objectname) and %XX byte escapes (%09 tab, %00 NUL, %0a LF).
//
// Collision avoidance: spec specificity is 3 (required --sort + --format),
// same as for-each-ref-sorted, which shares the structural shape.  Mutual
// exclusion via refine:
//   • for-each-ref-sorted accepts only BASIC placeholders → it REJECTS any
//     format with objectname atoms → hands off to us.
//   • Our refine REQUIRES %(objectname or %(*objectname → we REJECT
//     basic-only formats, so we never steal its fixtures.
//   • for-each-ref-upstream-track knows objectname but its spec has no
//     --sort → an argv carrying --sort never structurally matches it.
//   • Every other family path either lacks --sort or requires other atoms
//     (committerdate:unix, upstream:*, ≥2 patterns, --count).
import { definePath, isExecResult, ok } from "../core"
import { byRefname, entryRefname, isoToUnix, listBranches, refMatches, renderRef, renderable } from "../refs"

const SORTABLE = /^-?(committerdate|refname)$/
const SUPPORTED = /^(HEAD|refname|refname:short|objectname|\*objectname)$/

export default definePath({
	name: "for-each-ref-sort-objectname",
	summary: "for-each-ref with --sort and a %(objectname)/%(*objectname) format",
	spec: "for-each-ref --sort=<field> --format=<fmt> <patterns...>?",
	refine: (args) =>
		/%\(\*?objectname\)/.test(args.pos.fmt!) &&
		renderable(args.pos.fmt!, SUPPORTED) &&
		SORTABLE.test(args.pos.field!),

	async run(args, ctx) {
		const patterns = args.list.patterns ?? []
		const entries = await listBranches(ctx, "-a", "-v")
		if (isExecResult(entries)) return entries

		let refs = entries.map((e) => ({
			refname: entryRefname(e),
			current: !!e.current,
			hash: e.commit?.id ?? "",
			unixDate: Number(isoToUnix(e.commit?.date ?? "")) || 0,
		}))
		if (patterns.length > 0) refs = refs.filter((r) => patterns.some((p) => refMatches(p, r.refname)))

		const descending = args.pos.field!.startsWith("-")
		const field = descending ? args.pos.field!.slice(1) : args.pos.field!
		refs.sort(field === "committerdate" ? (a, b) => a.unixDate - b.unixDate : byRefname)
		if (descending) refs.reverse()

		return ok(
			refs
				.map(
					(r) =>
						renderRef(args.pos.fmt!, r.refname, r.current, {
							objectname: r.hash,
							"*objectname": "", // branch refs point at commits; there is nothing to peel
						}) + "\n",
				)
				.join(""),
		)
	},

	fixtures: [
		{
			name: "all refs, NUL-separated refname/hash/empty-peeled, newest first (space-form values)",
			argv: ["for-each-ref", "--sort", "-committerdate", "--format", "%(refname)%00%(objectname)%00%(*objectname)"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "dev",
							current: true,
							commit: { id: "e41f3a9b7d2c58e6012f7a4b9d3c8e5f0a1b2c3d", date: "2026-07-20T12:00:00+03:00" },
						},
						{
							local: true,
							name: "trunk",
							commit: { id: "f7b2e8d4c6a1953b0e7d2f4a8c1b6e9d3a5f7c2e", date: "2026-07-21T09:30:00+03:00" },
						},
						{
							name: "arcadia/trunk",
							commit: { id: "3d9c1e7a5b8f2d6c0a4e9b1d7f3c5a8e2b6d9c4f", date: "2026-07-19T18:00:00+03:00" },
						},
					]),
				},
			},
			want: {
				stdout:
					"refs/heads/trunk\x00f7b2e8d4c6a1953b0e7d2f4a8c1b6e9d3a5f7c2e\x00\n" +
					"refs/heads/dev\x00e41f3a9b7d2c58e6012f7a4b9d3c8e5f0a1b2c3d\x00\n" +
					"refs/remotes/arcadia/trunk\x003d9c1e7a5b8f2d6c0a4e9b1d7f3c5a8e2b6d9c4f\x00\n",
				code: 0,
			},
		},
		{
			name: "equals-form values, refname ascending sort, glob filter, tab escape",
			argv: ["for-each-ref", "--sort=refname", "--format=%(objectname)%09%(refname:short)", "refs/heads/*"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "dev",
							current: true,
							commit: { id: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1", date: "2026-07-20T12:00:00+03:00" },
						},
						{
							local: true,
							name: "feature-x",
							commit: { id: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c", date: "2026-07-18T08:00:00+03:00" },
						},
						{
							local: true,
							name: "trunk",
							commit: { id: "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d", date: "2026-07-21T09:30:00+03:00" },
						},
						{
							name: "arcadia/trunk",
							commit: { id: "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3", date: "2026-07-21T09:30:00+03:00" },
						},
					]),
				},
			},
			want: {
				stdout:
					"1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1\tdev\n" +
					"2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c\tfeature-x\n" +
					"3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d\ttrunk\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--sort=-committerdate", "--format=%(refname)%00%(objectname)", "refs/heads/nonexistent"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "trunk",
							current: true,
							commit: { id: "5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e", date: "2026-07-21T09:30:00+03:00" },
						},
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
