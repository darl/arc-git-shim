// Numeric shorthand for a bounded oneline history, matching the other
// plain-log paths' interactive arc passthrough.
import { definePath } from "../core"

export default definePath({
	name: "log-oneline-3",
	summary: "oneline log with the -3 count shorthand",
	spec: "log --oneline -3",

	async run(_args, ctx) {
		return ctx.arc(["log", "--oneline", "-n", "3"], { interactive: true })
	},

	fixtures: [
		{
			name: "bounded oneline history",
			argv: ["log", "--oneline", "-3"],
			arcReplies: {
				"log --oneline -n 3": {
					stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (HEAD -> feature-x) Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\ncccccccccccccccccccccccccccccccccccccccc Initial change\n",
				},
			},
			want: {
				stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (HEAD -> feature-x) Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\ncccccccccccccccccccccccccccccccccccccccc Initial change\n",
				code: 0,
			},
		},
		{
			name: "arc failure propagates",
			argv: ["log", "--oneline", "-3"],
			arcReplies: { "log --oneline -n 3": { stderr: "log failed\n", code: 1 } },
			want: { stdout: "", stderr: "log failed\n", code: 1 },
		},
	],
})
