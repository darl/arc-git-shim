// git worktree remove [--force] <path> → arc unmount --forget <path>
// (--forget also drops the mount's store — the git-remove semantics; without
// it the mount lingers in the [unmounted] inventory). arc gc is NOT run per
// remove (minutes-long; storage already dropped by --forget).
// arc requires unmount to run from OUTSIDE the tree → executed at "/".
import { definePath, ok } from "../core"

export default definePath({
	name: "worktree-remove",
	summary: "arc unmount --forget of a mount path",
	spec: "worktree remove (--force|-f)? <path>",

	async run(args, ctx) {
		const r = await ctx.arc(["unmount", "--forget", args.pos.path!], { cwd: "/" })
		return r.code === 0 ? ok("") : r
	},

	fixtures: [
		{
			name: "remove a mount",
			argv: ["worktree", "remove", "/wt/task-1"],
			arcReplies: { "unmount --forget /wt/task-1": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "forced remove same mapping",
			argv: ["worktree", "remove", "--force", "/wt/task-2"],
			arcReplies: { "unmount --forget /wt/task-2": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
