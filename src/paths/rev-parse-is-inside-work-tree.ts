// The shim only dispatches paths INSIDE an arc tree (outside, it execs real
// git), so this is constant — no arc call.
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-is-inside-work-tree",
	summary: "constant true inside an arc tree",
	spec: "rev-parse --is-inside-work-tree",

	async run() {
		return ok("true\n")
	},

	fixtures: [
		{
			name: "always true",
			argv: ["rev-parse", "--is-inside-work-tree"],
			arcReplies: {},
			want: { stdout: "true\n", code: 0 },
		},
	],
})
