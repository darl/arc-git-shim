// The single arcadia remote cannot be added to or removed — codified fatal.
import { definePath, fail } from "../core"

const MUTATING = new Set(["add", "remove", "rm", "rename", "set-url", "prune"])

export default definePath({
	name: "unsupported-remote-mutate",
	summary: "remote add/remove/set-url are meaningless with the single arcadia remote",
	spec: "remote <sub> <a>? <b>?",
	refine: (args) => MUTATING.has(args.pos.sub!),

	async run(args) {
		return fail(128, `fatal: 'remote ${args.pos.sub}' is not supported in an arc repository (the only remote is 'arcadia')\n`)
	},

	fixtures: [
		{
			name: "remote add fatals",
			argv: ["remote", "add", "upstream", "https://example.com/x.git"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'remote add' is not supported in an arc repository (the only remote is 'arcadia')\n",
				code: 128,
			},
		},
	],
})
