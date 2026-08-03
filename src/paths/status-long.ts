// Plain `git status` — tier 3 prose read by LLMs. arc's long status is already
// git-shaped ("On branch …", "Untracked files:"); passthrough. The "arc add"
// hints inside the prose are acceptable for prose tier.
import { definePath, forwardUntracked } from "../core"

export default definePath({
	name: "status-long",
	summary: "long status prose via arc status passthrough",
	spec: "status --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const arcArgs = ["status"]
		forwardUntracked(args, arcArgs)
		const r = await ctx.arc(arcArgs)
		return r
	},

	fixtures: [
		{
			name: "passthrough prose (golden arc shape)",
			argv: ["status"],
			arcReplies: {
				status: {
					stdout:
						"On branch pr-12345678\nYour branch is up-to-date with 'arcadia/users/darl/submit-1234'.\n\nnothing to commit, working tree clean\n",
				},
			},
			want: {
				stdout:
					"On branch pr-12345678\nYour branch is up-to-date with 'arcadia/users/darl/submit-1234'.\n\nnothing to commit, working tree clean\n",
				code: 0,
			},
		},
	],
})
