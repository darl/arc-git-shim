// git worktree prune — success no-op (contract). Stale [unmounted] entries
// cost nothing; real store cleanup is arc gc, deliberately not run here.
import { definePath, ok } from "../core"

export default definePath({
	name: "worktree-prune",
	summary: "no-op success",
	spec: "worktree prune (-v|--verbose)?",

	async run() {
		return ok("")
	},

	fixtures: [
		{
			name: "no-op",
			argv: ["worktree", "prune"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
