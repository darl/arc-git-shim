// git for-each-ref --format=%(refname:short)%09(committerdate:unix) refs/heads refs/remotes
// Iterates refs matching TWO OR MORE patterns with a format that uses only
// basic placeholders — %(HEAD) %(refname) %(refname:short) — plus %XX byte
// escapes and literal text.  The incoming format is notable: "(committerdate:unix)"
// is LITERAL prose (no leading %), NOT the %(committerdate:unix) placeholder,
// so no per-ref date lookup is needed.
//
// Local + remote branches come from `arc branch -a --json`; refs are built,
// filtered by glob patterns, sorted by refname (git for-each-ref default
// ordering), then rendered — all via the shared src/refs.ts machinery.
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), same as for-each-ref-committerdate which shares the
// "<patterns...>" shape.  Mutual exclusion:
//   • for-each-ref-committerdate.refine REQUIRES %(committerdate:unix) in
//     the format → it rejects our formats (basic placeholders only).
//   • Our refine REQUIRES ≥2 patterns AND all %(...) placeholders in
//     {HEAD,refname,refname:short} → we reject formats with
//     %(committerdate:unix) (not in our SUPPORTED set) and we reject
//     single-pattern argvs.
//   • for-each-ref-remotes / for-each-ref-heads declare a single positional,
//     so an argv with ≥2 patterns never structurally matches them.
//   • for-each-ref-sorted requires --sort, which our argv never carries.
import { definePath, isExecResult, ok } from "../core"
import { BASIC_PLACEHOLDERS, byRefname, entryRefname, listBranches, refMatches, renderRef, renderable } from "../refs"

export default definePath({
	name: "for-each-ref-multi-pattern",
	summary: "for-each-ref with ≥2 patterns and basic %(...) placeholders (no committerdate)",
	spec: "for-each-ref --format=<fmt> <patterns...>",
	refine: (args) => (args.list.patterns?.length ?? 0) >= 2 && renderable(args.pos.fmt!, BASIC_PLACEHOLDERS),

	async run(args, ctx) {
		const patterns = args.list.patterns ?? []
		const entries = await listBranches(ctx, "-a")
		if (isExecResult(entries)) return entries
		const refs = entries
			.map((e) => ({ refname: entryRefname(e), current: !!e.current }))
			.filter((r) => patterns.some((p) => refMatches(p, r.refname)))
			.sort(byRefname)
		return ok(refs.map((r) => renderRef(args.pos.fmt!, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "short refname + tab + literal committerdate text for heads and remotes",
			argv: ["for-each-ref", "--format=%(refname:short)%09(committerdate:unix)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
					]),
				},
			},
			want: {
				stdout:
					"dev\t(committerdate:unix)\n" +
					"trunk\t(committerdate:unix)\n" +
					"arcadia/trunk\t(committerdate:unix)\n" +
					"arcadia/users/darl/foo\t(committerdate:unix)\n",
				code: 0,
			},
		},
		{
			name: "HEAD marker + full refname across heads and remotes",
			argv: ["for-each-ref", "--format=%(HEAD)%09%(refname)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: {
				stdout: "*\trefs/heads/dev\n" + " \trefs/heads/trunk\n" + " \trefs/remotes/arcadia/trunk\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "refs/heads/nonexistent", "refs/remotes/nonexistent"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
