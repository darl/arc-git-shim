// Plumbing-level ref surgery has no arc counterpart. Contract: expected
// unneeded once worktree paths are native; codified fatal until a learn
// episode proves otherwise.
import { definePath, fail } from "../core"

export default definePath({
	name: "unsupported-update-ref",
	summary: "raw ref surgery has no arc equivalent",
	spec: "update-ref *",

	async run() {
		return fail(128, "fatal: 'update-ref' is not supported in an arc repository\n")
	},

	fixtures: [
		{
			name: "update-ref fatals",
			argv: ["update-ref", "-d", "refs/heads/x"],
			arcReplies: {},
			want: { stdout: "", stderr: "fatal: 'update-ref' is not supported in an arc repository\n", code: 128 },
		},
	],
})
