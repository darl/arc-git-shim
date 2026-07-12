// git restore [--worktree] [--source=HEAD] [--] <paths...> — discard
// working-tree edits → arc checkout <paths> (arc rejects "--").
// A non-HEAD --source has different semantics → refine rejects → learnable.
import { definePath, ok } from "../core"

export default definePath({
	name: "restore-worktree",
	summary: "discard working-tree changes via arc checkout",
	spec: "restore (--worktree|-W)? --source=<src>? (-q|--quiet)? --? <paths...>",
	// --staged is undeclared in the spec, so it can never parse into this path
	refine: (args) => args.pos.src === undefined || args.pos.src === "HEAD",

	async run(args, ctx) {
		const r = await ctx.arc(["checkout", ...args.list.paths!])
		return r.code === 0 ? ok("") : r
	},

	fixtures: [
		{
			name: "worktree restore from HEAD",
			argv: ["restore", "--worktree", "--source=HEAD", "--", "foo.go"],
			arcReplies: { "checkout foo.go": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "bare restore",
			argv: ["restore", "foo.go"],
			arcReplies: { "checkout foo.go": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
