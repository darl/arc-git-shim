// Arc mounts cannot represent git's worktree lock and its recorded reason:
// in particular, the shim's worktree inventory and removal do not honor them.
// Refuse before mounting rather than report a lock that is not enforced.
import { definePath, fail } from "../core"

export default definePath({
	name: "worktree-add-locked",
	summary: "reject locked worktree creation, which arc cannot faithfully represent",
	spec: "worktree add --lock --reason=<reason> --? <path> <base>",

	async run() {
		return fail(128, "fatal: locked worktree creation is not supported in an arc repository\n")
	},

	fixtures: [
		{
			name: "locked worktree with reason is refused without mounting",
			argv: ["worktree", "add", "--lock", "--reason", "task creation", "--", "/wt/task", "feature-x"],
			arcReplies: {},
			want: { code: 128, stderr: "fatal: locked worktree creation is not supported in an arc repository\n" },
		},
	],
})
