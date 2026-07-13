// origin is silently accepted as an input alias for arcadia (cross-cutting
// contract); any other remote name is git's exit-2 error.
import { ARC_REMOTE_URL, definePath, fail, isRemoteAlias, ok } from "../core"

export default definePath({
	name: "remote-get-url",
	summary: "URL of the single arcadia remote",
	spec: "remote <sub> <name>",
	refine: (args) => args.pos.sub === "get-url",

	async run(args) {
		const name = args.pos.name!
		if (!isRemoteAlias(name)) return fail(2, `error: No such remote '${name}'\n`)
		return ok(`${ARC_REMOTE_URL}\n`)
	},

	fixtures: [
		{
			name: "arcadia url",
			argv: ["remote", "get-url", "arcadia"],
			arcReplies: {},
			want: { stdout: "arc://arcadia/arcadia\n", code: 0 },
		},
		{
			name: "origin alias accepted",
			argv: ["remote", "get-url", "origin"],
			arcReplies: {},
			want: { stdout: "arc://arcadia/arcadia\n", code: 0 },
		},
		{
			name: "unknown remote",
			argv: ["remote", "get-url", "upstream"],
			arcReplies: {},
			want: { stdout: "", stderr: "error: No such remote 'upstream'\n", code: 2 },
		},
	],
})
