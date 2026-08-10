// git for-each-ref --count=1 --format=%(refname) refs/remotes
//
// Lists refs matching a pattern (or all refs when no pattern is given),
// sorted by refname (git for-each-ref default ordering), truncated to the
// first --count refs, then rendered through a %(...) format.  Supported
// placeholders: %(HEAD) %(refname) %(refname:short) and %XX byte escapes
// (%09 tab, %0a LF).  Unsupported placeholders → refine rejects → learnable.
//
// Local + remote branches come from ONE `arc branch -a --json` call (entries
// with local:true → refs/heads/<name>, entries without → refs/remotes/<name>).
//
// Collision avoidance: spec specificity is 3 (two required value-flags:
// --format and --count), same as for-each-ref-sorted.  Mutual exclusion:
//   • for-each-ref-sorted requires --sort=<field>; our argv never carries
//     --sort → it doesn't match sorted.  Sorted's argv carries --sort →
//     our spec doesn't declare it → strict parse fails → doesn't match us.
//   • All other for-each-ref paths (specificity 2) don't declare --count;
//     an argv with --count → their strict parse fails on the undeclared flag.
//   • for-each-ref-committerdate / for-each-ref-multi-pattern share the
//     "for-each-ref --format=<fmt> <patterns...>" shape (specificity 2) but
//     also lack --count → same reasoning.
import { definePath, isExecResult, ok } from "../core"
import { BASIC_PLACEHOLDERS, byRefname, entryRefname, listBranches, refMatches, renderRef, renderable } from "../refs"

export default definePath({
	name: "for-each-ref-count",
	summary: "for-each-ref with --count (no --sort) and basic %(...) placeholders",
	spec: "for-each-ref --format=<fmt> --count=<count> <pattern>?",
	refine: (args) => renderable(args.pos.fmt!, BASIC_PLACEHOLDERS),

	async run(args, ctx) {
		const entries = await listBranches(ctx, "-a")
		if (isExecResult(entries)) return entries
		let refs = entries
			.map((e) => ({ refname: entryRefname(e), current: !!e.current }))
			.sort(byRefname)
		if (args.pos.pattern !== undefined) refs = refs.filter((r) => refMatches(args.pos.pattern!, r.refname))
		const count = parseInt(args.pos.count!, 10)
		if (!isNaN(count)) refs = refs.slice(0, Math.max(0, count))
		return ok(refs.map((r) => renderRef(args.pos.fmt!, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "count=1 on refs/remotes returns first remote ref by refname",
			argv: ["for-each-ref", "--count=1", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/feature-x" },
					]),
				},
			},
			want: { stdout: "refs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			name: "count=2 on refs/heads returns first two local refs by refname",
			argv: ["for-each-ref", "--count=2", "--format=%(refname:short)", "refs/heads"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ local: true, name: "users/darl/feature-x" },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: { stdout: "dev\ntrunk\n", code: 0 },
		},
		{
			name: "no pattern with count=1 returns first ref overall",
			argv: ["for-each-ref", "--count=1", "--format=%(refname)"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ name: "arcadia/trunk" },
						{ local: true, name: "trunk", current: true },
					]),
				},
			},
			want: { stdout: "refs/heads/trunk\n", code: 0 },
		},
		{
			name: "count larger than available refs returns all matches",
			argv: ["for-each-ref", "--count=10", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
					]),
				},
			},
			want: {
				stdout: "refs/remotes/arcadia/trunk\nrefs/remotes/arcadia/users/darl/foo\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--count=1", "--format=%(refname)", "refs/remotes/nonexistent"],
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
