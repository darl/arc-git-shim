// git worktree prune [-n|--dry-run] [-v|--verbose] — garbage-collect stale
// mount bookkeeping, mirroring git's semantics exactly.
// Native git prunes $GIT_DIR/worktrees/<id> admin dirs whose gitdir points
// at a path that no longer exists (worktree deleted by hand instead of
// `worktree remove`); locked entries survive; it NEVER touches working
// trees. Arc analog: `arc unmount --list` [unmounted] entries are that
// bookkeeping (mount-point record + store). An [unmounted] entry whose
// directory still exists is a REMOUNTABLE worktree (daemon died, reboot,
// relay kill — arc-remount restores those), so it maps to git's "locked"
// and is never pruned; only entries whose mount path is gone from the
// filesystem are forgotten (arc unmount --forget drops record + store).
// --expire is deliberately NOT declared: arc keeps no per-entry timestamps,
// so that shape falls through instead of being silently mis-honored.
// arc requires unmount ops from OUTSIDE any tree → forget runs at "/".
import { existsSync } from "node:fs"
import { basename } from "node:path"
import { definePath, ok } from "../core"

export default definePath({
	name: "worktree-prune",
	summary: "forget [unmounted] arc entries whose mount dir is gone",
	spec: "worktree prune (-n|--dry-run)? (-v|--verbose)?",

	async run(args, ctx) {
		const lst = await ctx.arc(["unmount", "--list"])
		if (lst.code !== 0) return lst
		const stale = lst.stdout
			.split("\n")
			.filter((l) => l.startsWith("[unmounted]"))
			.map((l) => l.match(/ mount: (.*?) store: /)?.[1] ?? "")
			.filter((p) => p && !existsSync(p))
		const dry = args.flags.has("-n") || args.flags.has("--dry-run")
		// git prints removal lines when verbose OR dry-run (builtin/worktree.c)
		const chatty = dry || args.flags.has("-v") || args.flags.has("--verbose")
		const lines: string[] = []
		for (const mnt of stale) {
			if (!dry) {
				const r = await ctx.arc(["unmount", "--forget", mnt], { cwd: "/" })
				if (r.code !== 0) return r
			}
			if (chatty) lines.push(`Removing worktrees/${basename(mnt)}: mount point does not exist\n`)
		}
		return ok(lines.join(""))
	},

	fixtures: [
		{
			name: "stale entry (dir gone) forgotten silently",
			argv: ["worktree", "prune"],
			arcReplies: {
				"unmount --list": {
					stdout:
						"[unmounted] mount: /arc-git-fixture-missing/wt1 store: /s/1 object_store: /o\n" +
						"[mounted, pid: 7] mount: /arc-git-fixture-missing/live store: /s/2 object_store: /o\n",
				},
				"unmount --forget /arc-git-fixture-missing/wt1": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "dry-run reports but forgets nothing (no forget call canned)",
			argv: ["worktree", "prune", "--dry-run"],
			arcReplies: {
				"unmount --list": {
					stdout: "[unmounted] mount: /arc-git-fixture-missing/wt2 store: /s/1 object_store: /o\n",
				},
			},
			want: { stdout: "Removing worktrees/wt2: mount point does not exist\n", code: 0 },
		},
		{
			name: "verbose real prune names the removal",
			argv: ["worktree", "prune", "-v"],
			arcReplies: {
				"unmount --list": {
					stdout: "[unmounted] mount: /arc-git-fixture-missing/wt3 store: /s/1 object_store: /o\n",
				},
				"unmount --forget /arc-git-fixture-missing/wt3": {},
			},
			want: { stdout: "Removing worktrees/wt3: mount point does not exist\n", code: 0 },
		},
		{
			name: "unmounted entry with existing dir is remountable — kept (git 'locked')",
			argv: ["worktree", "prune", "-n"],
			arcReplies: {
				"unmount --list": {
					stdout: "[unmounted] mount: / store: /s/root object_store: /o\n",
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
