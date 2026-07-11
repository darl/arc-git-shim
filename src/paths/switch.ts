// git switch [<br>] / switch -c <br> [<base>] → arc checkout [-b].
import { definePath, ok } from "../core"

export default definePath({
	name: "switch",
	summary: "git switch mapped onto arc checkout",
	spec: "switch (-c|--create)=<newbr>? (-q|--quiet)? <target>?",
	refine: (args) => args.pos.newbr !== undefined || args.pos.target !== undefined,

	async run(args, ctx) {
		const arcArgs = ["checkout"]
		if (args.pos.newbr !== undefined) arcArgs.push("-b", args.pos.newbr)
		if (args.pos.target !== undefined) arcArgs.push(args.pos.target)
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return ok(args.flags.has("-q") || args.flags.has("--quiet") ? "" : r.stdout)
	},

	fixtures: [
		{
			name: "switch existing",
			argv: ["switch", "trunk"],
			arcReplies: { "checkout trunk": { stdout: "Switched to branch 'trunk'\n" } },
			want: { stdout: "Switched to branch 'trunk'\n", code: 0 },
		},
		{
			name: "switch -c new",
			argv: ["switch", "-c", "feature-z"],
			arcReplies: { "checkout -b feature-z": { stdout: "Switched to a new branch 'feature-z'\n" } },
			want: { stdout: "Switched to a new branch 'feature-z'\n", code: 0 },
		},
	],
})
