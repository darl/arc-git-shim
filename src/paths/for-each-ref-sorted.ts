// git for-each-ref --format=… --sort=-committerdate --exclude=… --count=N <patterns…>
// Lists refs matching glob patterns, sorted (by commit date or refname),
// optionally excluded and count-limited, formatted per git %(...) placeholders.
//
// Local + remote branches AND their tip-commit dates come from ONE
// `arc branch -a -v --json` call (commit.date per entry) — never a per-ref
// `arc log` N+1 (see src/refs.ts listBranches note and commit b6d0866).
// Dates compare as Unix seconds, not ISO strings: arc emits +03:00-style
// offsets, and mixed offsets order wrong lexicographically.
//
// Spec requires --sort to bump specificity above for-each-ref-heads (which
// has spec "for-each-ref --format=<fmt> <pattern>?", specificity 2); our
// specificity is 3 so we win on overlap and never collide.
import { definePath, isExecResult, ok } from "../core"
import { BASIC_PLACEHOLDERS, byRefname, entryRefname, isoToUnix, listBranches, refMatches, renderRef, renderable } from "../refs"

const SORTABLE = /^-?(committerdate|refname)$/

export default definePath({
	name: "for-each-ref-sorted",
	summary: "for-each-ref with --sort, optional --exclude/--count, and variadic patterns",
	spec: "for-each-ref --format=<fmt> --sort=<field> --exclude=<exclude>? --count=<count>? <patterns...>?",
	refine: (args) => renderable(args.pos.fmt!, BASIC_PLACEHOLDERS) && SORTABLE.test(args.pos.field!),

	async run(args, ctx) {
		const patterns = args.list.patterns ?? []
		const entries = await listBranches(ctx, "-a", "-v")
		if (isExecResult(entries)) return entries

		let refs = entries.map((e) => ({
			refname: entryRefname(e),
			current: !!e.current,
			unixDate: Number(isoToUnix(e.commit?.date ?? "")),
		}))
		if (patterns.length > 0) refs = refs.filter((r) => patterns.some((p) => refMatches(p, r.refname)))
		if (args.pos.exclude !== undefined) refs = refs.filter((r) => !refMatches(args.pos.exclude!, r.refname))

		const descending = args.pos.field!.startsWith("-")
		const field = descending ? args.pos.field!.slice(1) : args.pos.field!
		refs.sort(field === "committerdate" ? (a, b) => a.unixDate - b.unixDate : byRefname)
		if (descending) refs.reverse()

		const count = args.pos.count !== undefined ? parseInt(args.pos.count, 10) : undefined
		if (count !== undefined && !isNaN(count)) refs = refs.slice(0, Math.max(0, count))

		return ok(refs.map((r) => renderRef(args.pos.fmt!, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "trunk refs sorted by committerdate desc with NUL-separated format",
			argv: [
				"for-each-ref",
				"--format=%(refname)%00%(refname:short)",
				"--sort=-committerdate",
				"--exclude=refs/remotes/**/HEAD",
				"--count=80",
				"refs/heads/**/*trunk*",
				"refs/heads/**/*trunk*/**",
				"refs/remotes/**/*trunk*",
				"refs/remotes/**/*trunk*/**",
			],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", commit: { date: "2026-07-10T15:42:48+03:00" } },
						{ local: true, name: "other-branch", current: true },
						{ name: "arcadia/trunk", commit: { date: "2026-07-11T10:00:00+03:00" } },
						{ name: "arcadia/other" },
					]),
				},
			},
			want: {
				stdout: "refs/remotes/arcadia/trunk\x00arcadia/trunk\nrefs/heads/trunk\x00trunk\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "--sort=refname", "refs/heads/**/*nonexistent*"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk" }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "count limit truncates sorted results",
			argv: ["for-each-ref", "--format=%(refname:short)", "--sort=refname", "--count=1", "refs/heads/*"],
			arcReplies: {
				"branch -a -v --json": {
					stdout: JSON.stringify([
						{ local: true, name: "ccc" },
						{ local: true, name: "aaa" },
						{ local: true, name: "bbb" },
					]),
				},
			},
			want: { stdout: "aaa\n", code: 0 },
		},
	],
})
