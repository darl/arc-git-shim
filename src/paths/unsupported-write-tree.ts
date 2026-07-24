// git write-tree — see unsupported-read-tree for the checkpoint-plumbing story.
import { definePath, fail } from "../core"

const MSG = "fatal: arc-git: write-tree is not supported in arc checkouts (no git object database)\n"

export default definePath({
	name: "unsupported-write-tree",
	summary: "codified fatal: object-db plumbing has no arc equivalent",
	spec: "write-tree *?",
	async run() {
		return fail(128, MSG)
	},
	fixtures: [
		{
			name: "write-tree fails cleanly",
			argv: ["write-tree"],
			arcReplies: {},
			want: { stderr: MSG, code: 128 },
		},
	],
})
