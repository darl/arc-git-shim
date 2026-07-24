// git read-tree — object-database plumbing that t3code's checkpoint engine
// drives against a scratch GIT_INDEX_FILE. Arc exposes no loose object store,
// so checkpoints cannot be emulated; a codified fatal keeps the learner from
// burning episodes on unlearnable shapes. (Siblings: unsupported-write-tree,
// unsupported-commit-tree, unsupported-update-ref.)
import { definePath, fail } from "../core"

const MSG = "fatal: arc-git: read-tree is not supported in arc checkouts (no git object database)\n"

export default definePath({
	name: "unsupported-read-tree",
	summary: "codified fatal: object-db plumbing has no arc equivalent",
	spec: "read-tree *?",
	async run() {
		return fail(128, MSG)
	},
	fixtures: [
		{
			name: "read-tree HEAD fails cleanly",
			argv: ["read-tree", "HEAD"],
			arcReplies: {},
			want: { stderr: MSG, code: 128 },
		},
	],
})
