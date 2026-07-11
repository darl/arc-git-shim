// No-equivalent contract: git-style fatal, permanent codified path.
import { definePath, fail } from "../core"

export default definePath({
	name: "unsupported-clone",
	summary: "clone has no arc equivalent inside a mount (use arc mount)",
	spec: "clone *",

	async run() {
		return fail(128, "fatal: 'clone' is not supported in an arc repository (use 'arc mount' for a new working copy)\n")
	},

	fixtures: [
		{
			name: "clone fatals",
			argv: ["clone", "--depth", "1", "https://example.com/x.git"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'clone' is not supported in an arc repository (use 'arc mount' for a new working copy)\n",
				code: 128,
			},
		},
	],
})
