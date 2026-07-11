// Arcadia has no submodules — permanent codified fatal. orca's read-side
// probe (config --file .gitmodules --get ...) exits 1 via the config path,
// so this fatal only fires on explicit submodule commands.
import { definePath, fail } from "../core"

export default definePath({
	name: "unsupported-submodule",
	summary: "submodules do not exist in Arcadia",
	spec: "submodule *?",

	async run() {
		return fail(128, "fatal: 'submodule' is not supported in an arc repository (Arcadia has no submodules)\n")
	},

	fixtures: [
		{
			name: "submodule update fatals",
			argv: ["submodule", "update", "--init"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'submodule' is not supported in an arc repository (Arcadia has no submodules)\n",
				code: 128,
			},
		},
		{
			name: "bare submodule fatals",
			argv: ["submodule"],
			arcReplies: {},
			want: { code: 128 },
		},
	],
})
