// An arc mount is always a working tree, never bare.
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-is-bare-repository",
	summary: "constant false inside an arc tree",
	spec: "rev-parse --is-bare-repository",

	async run() {
		return ok("false\n")
	},

	fixtures: [
		{
			name: "always false",
			argv: ["rev-parse", "--is-bare-repository"],
			arcReplies: {},
			want: { stdout: "false\n", code: 0 },
		},
	],
})
