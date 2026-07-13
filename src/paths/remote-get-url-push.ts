// git remote get-url --push <name>  → push URL of the named remote.
// Arc has a single remote "arcadia" whose push and fetch URLs are the same
// (arc://arcadia). "origin" is silently accepted as an input alias; any
// other name is git's exit-2 error, matching the fetch-URL sibling path.
import { definePath, fail, isRemoteAlias, ok } from "../core"

export default definePath({
	name: "remote-get-url-push",
	summary: "push URL of the single arcadia remote",
	spec: "remote get-url --push <name>",

	async run(args) {
		const name = args.pos.name!
		if (!isRemoteAlias(name)) return fail(2, `error: No such remote '${name}'\n`)
		return ok("arc://arcadia\n")
	},

	fixtures: [
		{
			name: "arcadia push url",
			argv: ["remote", "get-url", "--push", "arcadia"],
			arcReplies: {},
			want: { stdout: "arc://arcadia\n", code: 0 },
		},
		{
			name: "origin alias accepted",
			argv: ["remote", "get-url", "--push", "origin"],
			arcReplies: {},
			want: { stdout: "arc://arcadia\n", code: 0 },
		},
		{
			name: "unknown remote",
			argv: ["remote", "get-url", "--push", "upstream"],
			arcReplies: {},
			want: { stdout: "", stderr: "error: No such remote 'upstream'\n", code: 2 },
		},
	],
})
