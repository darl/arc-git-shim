// git worktree prune --dry-run (-n alias) — report stale worktrees that
// would be pruned without actually removing them.  In the arc shim, prune
// itself is a no-op (real store cleanup is arc gc, deliberately not run),
// so there is nothing to report; --dry-run is therefore an empty-success
// no-op, matching git's behaviour when no stale worktree entries exist.
import { definePath, ok } from "../core"

export default definePath({
	name: "worktree-prune-dry-run",
	summary: "dry-run prune — empty no-op success",
	spec: "worktree prune (-n|--dry-run) (-v|--verbose)?",

	async run() {
		return ok("")
	},

	fixtures: [
		{
			name: "dry-run, nothing to prune",
			argv: ["worktree", "prune", "--dry-run"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "short flag -n",
			argv: ["worktree", "prune", "-n"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "dry-run with verbose",
			argv: ["worktree", "prune", "--dry-run", "-v"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
