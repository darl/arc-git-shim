// Git's numeric shorthand for a bounded oneline log; keep the same prose
// passthrough and decorations as the other plain-log shapes.
import { definePath } from "../core"

export default definePath({
	name: "log-oneline-40",
	summary: "oneline log with the -40 count shorthand",
	spec: "log --oneline -40",

	async run(_args, ctx) {
		return ctx.arc(["log", "--oneline", "-n", "40"], { interactive: true })
	},

	fixtures: [
		{
			name: "bounded oneline history",
			argv: ["log", "--oneline", "-40"],
			arcReplies: {
				"log --oneline -n 40": {
					stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (HEAD -> feature-x) Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\n",
				},
			},
			want: {
				stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (HEAD -> feature-x) Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\n",
				code: 0,
			},
		},
		{
			name: "arc failure propagates",
			argv: ["log", "--oneline", "-40"],
			arcReplies: { "log --oneline -n 40": { stderr: "log failed\n", code: 1 } },
			want: { stdout: "", stderr: "log failed\n", code: 1 },
		},
	],
})
