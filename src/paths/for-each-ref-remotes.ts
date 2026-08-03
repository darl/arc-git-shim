// git for-each-ref --format=%(refname) refs/remotes
// Lists remote-tracking refs under refs/remotes/.  Arc has no ref database;
// remote branches come from `arc branch -a --json` (entries without a
// `local` flag, names like "arcadia/trunk" → ref "refs/remotes/arcadia/trunk").
//
// Supported placeholders: %(HEAD) %(refname) %(refname:short) and %XX byte
// escapes (%09 tab, %0a LF).  Unsupported placeholders → refine rejects →
// learnable.  %(HEAD) always renders " ": remote refs are never the current
// branch.
//
// Spec specificity is 2 (same as for-each-ref-heads "for-each-ref
// --format=<fmt> <pattern>?", which also has one required value-flag).
// No collision: for-each-ref-heads.refine rejects patterns not starting
// with "refs/heads", and our refine rejects patterns not starting with
// "refs/remotes" — the two never accept the same argv.
import { definePath, isExecResult, ok } from "../core"
import { BASIC_PLACEHOLDERS, listBranches, refMatches, renderRef, renderable } from "../refs"

export default definePath({
	name: "for-each-ref-remotes",
	summary: "iterate remote-tracking refs (refs/remotes/) with a %(...) format",
	spec: "for-each-ref --format=<fmt> <pattern>",
	refine: (args) => args.pos.pattern!.startsWith("refs/remotes") && renderable(args.pos.fmt!, BASIC_PLACEHOLDERS),

	async run(args, ctx) {
		const entries = await listBranches(ctx, "-a")
		if (isExecResult(entries)) return entries
		const remotes = entries
			.filter((e) => !e.local)
			.map((e) => `refs/remotes/${e.name}`)
			.sort()
			.filter((ref) => refMatches(args.pos.pattern!, ref))
		return ok(remotes.map((ref) => renderRef(args.pos.fmt!, ref, false) + "\n").join(""))
	},

	fixtures: [
		{
			name: "list all remote refs by full refname",
			argv: ["for-each-ref", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
						{ local: true, name: "dev" },
					]),
				},
			},
			want: {
				stdout: "refs/remotes/arcadia/trunk\nrefs/remotes/arcadia/users/darl/foo\n",
				code: 0,
			},
		},
		{
			name: "short refname for a glob pattern",
			argv: ["for-each-ref", "--format=%(refname:short)", "refs/remotes/arcadia/users/*"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/foo" },
						{ name: "arcadia/users/bar" },
					]),
				},
			},
			want: {
				stdout: "arcadia/users/bar\narcadia/users/foo\n",
				code: 0,
			},
		},
		{
			name: "no remote refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk", current: true }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
