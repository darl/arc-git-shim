// Bounded oneline history scoped to the invocation directory. Like the
// unscoped oneline path, this is prose passed through from arc.
import { definePath } from "../core"

export default definePath({
	name: "log-oneline-40-directory",
	summary: "oneline history for the current directory",
	spec: "log --oneline -40 -- <path>",
	refine: (args) => args.pos.path === ".",

	async run(_args, ctx) {
		return ctx.arc(["log", "--oneline", "-n", "40", "--", "."], { interactive: true })
	},

	fixtures: [
		{
			name: "directory-scoped history",
			argv: ["log", "--oneline", "-40", "--", "."],
			arcReplies: {
				"log --oneline -n 40 -- .": {
					stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\n",
				},
			},
			want: {
				stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa Add feature\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb Earlier change\n",
				code: 0,
			},
		},
		{
			name: "arc error propagates",
			argv: ["log", "--oneline", "-40", "--", "."],
			arcReplies: { "log --oneline -n 40 -- .": { stderr: "log failed\n", code: 1 } },
			want: { stdout: "", stderr: "log failed\n", code: 1 },
		},
	],
})
