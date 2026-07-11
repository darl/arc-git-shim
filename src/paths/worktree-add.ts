// git worktree add [--no-track] -b <br> <path> [<base>] → the arc-mount
// lifecycle (orca crutch, ticket "Decide the orca compatibility bar"):
//   1. arc mount <path>            (FUSE mount; seconds–tens of seconds)
//   2. arc checkout -b users/<login>/<br> [<base>]   — run INSIDE the mount
// Per contract the worktree branch is created under users/<login>/ so a later
// push needs no injection (double-prefix guard covers it).
// Disk guardrail: each mount costs ~10 GB of store — accepted in grilling.
import { arcInfo, definePath, isExecResult, ok, pushLens } from "../core"

export default definePath({
	name: "worktree-add",
	summary: "arc mount + branch checkout inside the new mount",
	spec: "worktree add --no-track? --detach? -b=<branch>? <path> <base>?",

	async run(args, ctx) {
		const mountPath = args.pos.path!
		const m = await ctx.arc(["mount", mountPath])
		if (m.code !== 0) return m
		if (args.pos.branch !== undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			const branch = pushLens(args.pos.branch, info.user_login ?? "unknown")
			const co = ["checkout", "-b", branch]
			if (args.pos.base !== undefined) co.push(args.pos.base)
			const c = await ctx.arc(co, { cwd: mountPath })
			if (c.code !== 0) return c
		} else if (args.pos.base !== undefined) {
			const c = await ctx.arc(["checkout", args.pos.base], { cwd: mountPath })
			if (c.code !== 0) return c
		}
		return ok(`Preparing worktree (new branch '${args.pos.branch ?? args.pos.base ?? "trunk"}')\n`)
	},

	fixtures: [
		{
			name: "orca shape: no-track new branch from base",
			argv: ["worktree", "add", "--no-track", "-b", "task-1", "/wt/task-1", "trunk"],
			arcReplies: {
				"mount /wt/task-1": {},
				"info --json": { stdout: '{"branch":"pr-1","user_login":"darl"}' },
				"checkout -b users/darl/task-1 trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 'task-1')\n", code: 0 },
		},
		{
			name: "already-prefixed branch untouched",
			argv: ["worktree", "add", "-b", "users/darl/task-2", "/wt/task-2"],
			arcReplies: {
				"mount /wt/task-2": {},
				"info --json": { stdout: '{"user_login":"darl"}' },
				"checkout -b users/darl/task-2": {},
			},
			want: { stdout: "Preparing worktree (new branch 'users/darl/task-2')\n", code: 0 },
		},
		{
			name: "mount failure propagates",
			argv: ["worktree", "add", "-b", "x", "/no/perm"],
			arcReplies: {
				"mount /no/perm": { stderr: "Error: cannot mount\n", code: 1 },
			},
			want: { code: 1 },
		},
	],
})
