// git checkout -- <paths...> — discard working-tree changes. arc checkout
// REJECTS the "--" separator, so it is stripped before the arc call.
import { definePath, ok } from "../core"

export default definePath({
	name: "checkout-paths",
	summary: "restore working-tree paths via arc checkout (no --)",
	spec: "checkout (-q|--quiet)? -- <paths...>",

	async run(args, ctx) {
		const r = await ctx.arc(["checkout", ...args.list.paths!])
		if (r.code !== 0) return r
		return args.flags.has("-q") || args.flags.has("--quiet") ? ok("") : r
	},

	fixtures: [
		{
			name: "discard changes in two files",
			argv: ["checkout", "--", "foo.go", "bar.txt"],
			arcReplies: { "checkout foo.go bar.txt": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
