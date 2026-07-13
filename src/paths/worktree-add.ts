// git worktree add [--no-track] -b <br> <path> [<base>] → the arc-mount
// lifecycle (orca crutch, ticket "Decide the orca compatibility bar"):
//   1. arc mount <path>            (FUSE mount; seconds–tens of seconds)
//   2. arc checkout -b users/<login>/<br> [<base>]   — run INSIDE the mount
// Per contract the worktree branch is created under users/<login>/ so a later
// push needs no injection (double-prefix guard covers it).
//
// SHARED-STORE MODE (the ai/tools/arc_worktree "mount-shared" pattern): when
// both shim-config keys are set —
//   git config arcgit.storesbase  <dir>   # per-mount stores live under here
//   git config arcgit.objectstore <dir>   # ONE object store for all mounts
// — the mount gets `-S <storesbase>/<name> --object-store <objectstore>`, so
// objects download once and worktrees stop costing ~10 GB each. The shared
// object store is deliberately standalone (owned by no mount): a store owned
// by a mount would die with that mount's `unmount --forget`.
// Without the keys: plain isolated-store mount (original behavior).
import { arcInfo, arcRev, definePath, isExecResult, ok, pushLens } from "../core"

export default definePath({
	name: "worktree-add",
	summary: "arc mount (shared object store if configured) + branch checkout",
	spec: "worktree add --no-track? --detach? -b=<branch>? <path> <base>?",

	async run(args, ctx) {
		const mountPath = args.pos.path!
		const storesBase = ctx.config.get("arcgit.storesbase")
		const objectStore = ctx.config.get("arcgit.objectstore")
		const mountArgs = ["mount", mountPath]
		if (storesBase && objectStore) {
			// arc-wt's mount-shared argv shape: mount -m <path> -S <store> --object-store <obj>
			const name = mountPath.split("/").filter(Boolean).pop()!
			mountArgs.splice(1, 0, "-m")
			mountArgs.push("-S", `${storesBase}/${name}`, "--object-store", objectStore)
		}
		const m = await ctx.arc(mountArgs)
		if (m.code !== 0) return m
		// orca qualifies the base it probed (refs/remotes/arcadia/trunk) before
		// handing it to worktree add; arc only knows the short form
		const base = args.pos.base !== undefined ? arcRev(args.pos.base) : undefined
		if (args.pos.branch !== undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			const branch = pushLens(args.pos.branch, info.user_login ?? "unknown")
			const co = ["checkout", "-b", branch]
			if (base !== undefined) co.push(base)
			const c = await ctx.arc(co, { cwd: mountPath })
			if (c.code !== 0) return c
		} else if (base !== undefined) {
			const c = await ctx.arc(["checkout", base], { cwd: mountPath })
			if (c.code !== 0) return c
		}
		return ok(`Preparing worktree (new branch '${args.pos.branch ?? args.pos.base ?? "trunk"}')\n`)
	},

	fixtures: [
		{
			name: "shared-store mode: arc-wt mount-shared argv shape",
			argv: ["worktree", "add", "-b", "task-3", "/wt/task-3", "trunk"],
			config: { "arcgit.storesbase": "/home/u/.arc/stores", "arcgit.objectstore": "/home/u/arc_obj_store" },
			arcReplies: {
				"mount -m /wt/task-3 -S /home/u/.arc/stores/task-3 --object-store /home/u/arc_obj_store": {},
				"info --json": { stdout: '{"branch":"pr-1","user_login":"darl"}' },
				"checkout -b users/darl/task-3 trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 'task-3')\n", code: 0 },
		},
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
			name: "orca qualified base normalized to arc's short form",
			argv: ["worktree", "add", "--no-track", "-b", "perf-task", "/wt/perf-task", "refs/remotes/arcadia/trunk"],
			arcReplies: {
				"mount /wt/perf-task": {},
				"info --json": { stdout: '{"branch":"pr-1","user_login":"darl"}' },
				"checkout -b users/darl/perf-task arcadia/trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 'perf-task')\n", code: 0 },
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
