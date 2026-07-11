// Exactly one remote exists in the arc world: "arcadia".
import { definePath, ok } from "../core"

export default definePath({
	name: "remote-list",
	summary: "the single remote: arcadia",
	spec: "remote (-v|--verbose)?",

	async run(args) {
		if (args.flags.has("-v") || args.flags.has("--verbose"))
			return ok("arcadia\tarc://arcadia (fetch)\narcadia\tarc://arcadia (push)\n")
		return ok("arcadia\n")
	},

	fixtures: [
		{
			name: "list remotes",
			argv: ["remote"],
			arcReplies: {},
			want: { stdout: "arcadia\n", code: 0 },
		},
		{
			name: "verbose",
			argv: ["remote", "-v"],
			arcReplies: {},
			want: { stdout: "arcadia\tarc://arcadia (fetch)\narcadia\tarc://arcadia (push)\n", code: 0 },
		},
	],
})
