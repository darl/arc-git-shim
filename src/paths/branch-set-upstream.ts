// git branch --set-upstream-to=<upstream> [<branch>] → arc branch -u.
// The upstream ref is used LITERALLY after stripping a leading remote name
// (arcadia/ or origin/) — arc names upstreams without the remote prefix.
import { definePath } from "../core"

export default definePath({
	name: "branch-set-upstream",
	summary: "set upstream via arc branch -u",
	spec: "branch (--set-upstream-to|-u)=<upstream> <branch>?",

	async run(args, ctx) {
		const up = args.pos.upstream!.replace(/^(arcadia|origin)\//, "")
		const arcArgs = ["branch", "-u", up]
		if (args.pos.branch !== undefined) arcArgs.push(args.pos.branch)
		const r = await ctx.arc(arcArgs)
		return r
	},

	fixtures: [
		{
			name: "remote prefix stripped for arc",
			argv: ["branch", "--set-upstream-to=arcadia/users/darl/feature-x"],
			arcReplies: {
				"branch -u users/darl/feature-x": {
					stdout: "branch 'feature-x' set up to track 'arcadia/users/darl/feature-x'\n",
				},
			},
			want: { stdout: "branch 'feature-x' set up to track 'arcadia/users/darl/feature-x'\n", code: 0 },
		},
	],
})
