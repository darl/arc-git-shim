// git worktree list --porcelain [-z] — orca parses worktree/HEAD/branch
// blocks. Mounts come from `arc unmount --list` (GOLDEN line shape:
// "[mounted, pid: N] mount: /path store: ... object_store: ..." /
// "[unmounted] mount: ...") — only mounted entries are live worktrees.
// HEAD + branch per mount via arc info --json executed inside that mount.
// Branch refs are FULL and EXPLICIT: refs/heads/<name> incl. users/....
import { arcJson, definePath, isDetached, isExecResult, ok, SHORT_HASH_LEN } from "../core"

function parseMountList(out: string): string[] {
	return out
		.split("\n")
		.filter((l) => l.startsWith("[mounted"))
		.map((l) => {
			const m = l.match(/ mount: (.*?) store: /)
			return m ? m[1]! : ""
		})
		.filter(Boolean)
}

export default definePath({
	name: "worktree-list",
	summary: "porcelain worktree blocks from arc mount inventory",
	spec: "worktree list --porcelain? -z?",

	async run(args, ctx) {
		const lst = await ctx.arc(["unmount", "--list"])
		if (lst.code !== 0) return lst
		const mounts = parseMountList(lst.stdout)
		// mounts are independent — probe them all concurrently
		const infos = await Promise.all(
			mounts.map((mnt) => arcJson<{ branch?: string; hash?: string }>(ctx, ["info", "--json"], { cwd: mnt })),
		)
		const trees: { mnt: string; hash: string; branch?: string }[] = []
		for (let i = 0; i < mounts.length; i++) {
			const j = infos[i]!
			if (isExecResult(j)) continue // stale/broken mount: skip, like git prunable entries
			trees.push({ mnt: mounts[i]!, hash: j.hash ?? "0".repeat(40), branch: isDetached(j.branch) ? undefined : j.branch })
		}
		// git prints the MAIN worktree first and consumers (orca) key "primary"
		// off that position. Arc mounts are peers with no main/linked notion, so
		// emulate: the mount this command runs inside is the caller's repo — it
		// goes first (orca always lists from the repo's own path).
		trees.sort((a, b) => Number(b.mnt === ctx.arcRoot) - Number(a.mnt === ctx.arcRoot))
		if (!args.flags.has("--porcelain")) {
			// human table (loose): path  hash  [branch]
			return ok(trees.map((t) => `${t.mnt}  ${t.hash.slice(0, SHORT_HASH_LEN)} [${t.branch ?? "detached"}]\n`).join(""))
		}
		const blocks = trees.map((t) => [
			`worktree ${t.mnt}`,
			`HEAD ${t.hash}`,
			t.branch ? `branch refs/heads/${t.branch}` : "detached",
		])
		if (args.flags.has("-z")) return ok(blocks.map((b) => b.join("\0") + "\0\0").join(""))
		return ok(blocks.map((b) => b.join("\n") + "\n\n").join(""))
	},

	fixtures: [
		{
			name: "porcelain blocks for mounted trees",
			argv: ["worktree", "list", "--porcelain"],
			arcReplies: {
				"unmount --list": {
					stdout:
						"[unmounted] mount: /Users/darl/old store: /s/old object_store: /s/old/.arc/objects \n[mounted, pid: 57290] mount: /Users/darl/arcadia store: /s/a object_store: /s/a/.arc/objects\n",
				},
				"info --json": {
					stdout:
						'{"branch":"users/darl/task-1","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: {
				stdout:
					"worktree /Users/darl/arcadia\nHEAD a7819db772eed4b7b5a49b558b22f185464b80a0\nbranch refs/heads/users/darl/task-1\n\n",
				code: 0,
			},
		},
		{
			name: "caller's mount emitted first (orca keys primary off position)",
			argv: ["worktree", "list", "--porcelain"],
			arcReplies: {
				"unmount --list": {
					stdout:
						"[mounted, pid: 2] mount: /wt/task store: /s/t object_store: /o\n[mounted, pid: 1] mount: /arcadia store: /s/a object_store: /o\n",
				},
				"info --json": {
					stdout: '{"branch":"users/darl/task-1","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: {
				stdout:
					"worktree /arcadia\nHEAD a7819db772eed4b7b5a49b558b22f185464b80a0\nbranch refs/heads/users/darl/task-1\n\n" +
					"worktree /wt/task\nHEAD a7819db772eed4b7b5a49b558b22f185464b80a0\nbranch refs/heads/users/darl/task-1\n\n",
				code: 0,
			},
		},
		{
			name: "NUL-delimited",
			argv: ["worktree", "list", "--porcelain", "-z"],
			arcReplies: {
				"unmount --list": {
					stdout: "[mounted, pid: 1] mount: /wt/t store: /s object_store: /s/.arc/objects\n",
				},
				"info --json": { stdout: '{"branch":"users/darl/t","hash":"c79064cbea91ca389afe153a347d588452fe50df"}' },
			},
			want: {
				stdout:
					"worktree /wt/t\0HEAD c79064cbea91ca389afe153a347d588452fe50df\0branch refs/heads/users/darl/t\0\0",
				code: 0,
			},
		},
	],
})
