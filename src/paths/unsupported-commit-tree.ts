// git commit-tree — see unsupported-read-tree for the checkpoint-plumbing story.
import { definePath, fail } from "../core"

const MSG = "fatal: 'commit-tree' is not supported in an arc repository (no git object database)\n"

export default definePath({
	name: "unsupported-commit-tree",
	summary: "codified fatal: object-db plumbing has no arc equivalent",
	spec: "commit-tree *?",
	async run() {
		return fail(128, MSG)
	},
	fixtures: [
		{
			name: "commit-tree fails cleanly",
			argv: ["commit-tree", "abc123", "-m", "t3 checkpoint ref=x"],
			arcReplies: {},
			want: { stderr: MSG, code: 128 },
		},
	],
})
