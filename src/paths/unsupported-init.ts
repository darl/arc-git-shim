// Initializing a Git object database has no equivalent inside an Arc working copy.
import { definePath, fail } from "../core"

export default definePath({
	name: "unsupported-init",
	summary: "reject Git repository initialization in an Arc working copy",
	spec: "init",

	async run() {
		return fail(128, "fatal: 'init' is not supported in an arc repository\n")
	},

	fixtures: [
		{
			name: "initialization is unsupported",
			argv: ["init"],
			arcReplies: {},
			want: { stdout: "", stderr: "fatal: 'init' is not supported in an arc repository\n", code: 128 },
		},
	],
})
