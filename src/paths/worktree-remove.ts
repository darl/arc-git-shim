// git worktree remove [--force] <path> — the arc-mount teardown.
// FUSE mounts (unlike git's plain worktree dirs) can be BUSY: any open fd or
// cwd inside blocks a plain unmount (orca terminals, editors, even the shim's
// own status poll). Semantics:
//   --force  → arc unmount --force (detaches even when busy; holders keep
//              running, their fds go stale — verified live), then a second
//              arc unmount --forget drops the mount-point record + store.
//   no force → git parity: refuse a dirty tree with git's exact fatal (orca's
//              delete flow relies on that refusal to prompt for force); then
//              arc unmount --forget — a busy failure passes arc's stderr
//              through verbatim (it names holder PIDs, better than git could).
// --forget also drops the mount's store — the git-remove semantics; without
// it the mount lingers in the [unmounted] inventory. arc gc is NOT run per
// remove (minutes-long; storage already dropped by --forget).
// In shared-store mode (see worktree-add) only the mount's small private
// store dies here — the shared object store is owned by no mount and
// survives every remove.
// arc requires unmount to run from OUTSIDE the tree → executed at "/".
import { arcJson, definePath, fail, isExecResult, ok } from "../core"

export default definePath({
	name: "worktree-remove",
	summary: "arc unmount of a mount path (force-detach when busy)",
	spec: "worktree remove (--force|-f)? <path>",

	async run(args, ctx) {
		const mnt = args.pos.path!
		if (args.flags.has("--force") || args.flags.has("-f")) {
			const u = await ctx.arc(["unmount", "--force", mnt], { cwd: "/" })
			if (u.code !== 0) return u
			const f = await ctx.arc(["unmount", "--forget", mnt], { cwd: "/" })
			return f.code === 0 ? ok("") : f
		}
		const st = await arcJson<{ status?: Record<string, unknown[]> }>(
			ctx,
			["status", "--json", "-u", "all"],
			{ cwd: mnt },
		)
		if (isExecResult(st)) return st
		if (Object.values(st.status ?? {}).some((e) => e.length > 0))
			return fail(128, `fatal: '${mnt}' contains modified or untracked files, use --force to delete it\n`)
		const r = await ctx.arc(["unmount", "--forget", mnt], { cwd: "/" })
		return r.code === 0 ? ok("") : r
	},

	fixtures: [
		{
			name: "clean tree removes (status checked first)",
			argv: ["worktree", "remove", "/wt/task-1"],
			arcReplies: {
				"status --json -u all": { stdout: '{"status":{}}' },
				"unmount --forget /wt/task-1": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "dirty tree refused with git's fatal (no unmount attempted)",
			argv: ["worktree", "remove", "/wt/task-2"],
			arcReplies: {
				"status --json -u all": {
					stdout: '{"status":{"untracked":[{"status":"untracked","type":"file","path":"junk/x.txt"}]}}',
				},
			},
			want: {
				stdout: "",
				stderr: "fatal: '/wt/task-2' contains modified or untracked files, use --force to delete it\n",
				code: 128,
			},
		},
		{
			name: "force: detach busy mount, then forget store",
			argv: ["worktree", "remove", "--force", "/wt/task-3"],
			arcReplies: {
				"unmount --force /wt/task-3": {},
				"unmount --forget /wt/task-3": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "busy failure passes arc's holder listing through",
			argv: ["worktree", "remove", "/wt/task-4"],
			arcReplies: {
				"status --json -u all": { stdout: '{"status":{}}' },
				"unmount --forget /wt/task-4": {
					stderr:
						"fusermount: failed to unmount /wt/task-4: Device or resource busy\nThe following processes are accessing the working copy:\n    123 bash\nPlease tell them to stop.\n",
					code: 1,
				},
			},
			want: {
				stderr:
					"fusermount: failed to unmount /wt/task-4: Device or resource busy\nThe following processes are accessing the working copy:\n    123 bash\nPlease tell them to stop.\n",
				code: 1,
			},
		},
	],
})
