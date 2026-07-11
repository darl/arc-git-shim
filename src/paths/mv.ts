// git mv <src> <dst> → arc mv (exists as a first-class arc mode).
import { definePath, ok } from "../core"

export default definePath({
	name: "mv",
	summary: "move/rename via arc mv",
	spec: "mv (-f|--force)? <src> <dst>",

	async run(args, ctx) {
		const arcArgs = ["mv"]
		if (args.flags.has("-f") || args.flags.has("--force")) arcArgs.push("--force")
		arcArgs.push(args.pos.src!, args.pos.dst!)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "rename file",
			argv: ["mv", "old.txt", "new.txt"],
			arcReplies: { "mv old.txt new.txt": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
