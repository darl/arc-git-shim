// git restore --staged [--] <paths...> — unstage. arc reset [BRANCH] [PATH]...
// with paths resets the index for those paths (mixed semantics).
import { definePath, ok } from "../core"

export default definePath({
	name: "restore-staged",
	summary: "unstage paths via arc reset",
	spec: "restore --staged (-q|--quiet)? --? <paths...>",

	async run(args, ctx) {
		const r = await ctx.arc(["reset", "HEAD", ...args.list.paths!])
		return r.code === 0 ? ok("") : r
	},

	fixtures: [
		{
			name: "unstage two paths",
			argv: ["restore", "--staged", "--", "a.txt", "b/c.txt"],
			arcReplies: { "reset HEAD a.txt b/c.txt": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "without separator",
			argv: ["restore", "--staged", "a.txt"],
			arcReplies: { "reset HEAD a.txt": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
