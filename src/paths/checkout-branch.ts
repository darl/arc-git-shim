// git checkout <target> / checkout -b <br> [<base>] / git switch [-c] —
// exit-code tier, direct arc checkout mapping. NOTE: arc checkout rejects
// the "--" separator; the paths form lives in checkout-paths.
import { definePath, ok } from "../core"

export default definePath({
	name: "checkout-branch",
	summary: "switch branches / create via arc checkout",
	spec: "checkout -b=<newbr>? (-q|--quiet)? --no-track? (-f|--force)? <target>?",
	refine: (args) => args.pos.newbr !== undefined || args.pos.target !== undefined,

	async run(args, ctx) {
		const arcArgs = ["checkout"]
		if (args.pos.newbr !== undefined) arcArgs.push("-b", args.pos.newbr)
		if (args.flags.has("--no-track")) arcArgs.push("--no-track")
		if (args.flags.has("-f") || args.flags.has("--force")) arcArgs.push("--force")
		if (args.pos.target !== undefined) arcArgs.push(args.pos.target)
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return ok(args.flags.has("-q") || args.flags.has("--quiet") ? "" : r.stdout)
	},

	fixtures: [
		{
			name: "switch to existing branch",
			argv: ["checkout", "trunk"],
			arcReplies: { "checkout trunk": { stdout: "Switched to branch 'trunk'\n" } },
			want: { stdout: "Switched to branch 'trunk'\n", code: 0 },
		},
		{
			name: "create from base",
			argv: ["checkout", "-b", "feature-y", "trunk"],
			arcReplies: { "checkout -b feature-y trunk": { stdout: "Switched to a new branch 'feature-y'\n" } },
			want: { stdout: "Switched to a new branch 'feature-y'\n", code: 0 },
		},
	],
})
