// git worktree list --porcelain [-z] — orca parses worktree/HEAD/branch
// blocks. Mounts come from `arc unmount --list` (GOLDEN line shape:
// "[mounted, pid: N] mount: /path store: ... object_store: ..." /
// "[unmounted] mount: ...") — only mounted entries are live worktrees.
// HEAD + branch per mount via arc info --json executed inside that mount.
// Branch refs are FULL and EXPLICIT: refs/heads/<name> incl. users/....
import { definePath, ok } from "../core"

export function parseMountList(out: string): string[] {
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
		const blocks: string[][] = []
		for (const mnt of mounts) {
			const info = await ctx.arc(["info", "--json"], { cwd: mnt })
			if (info.code !== 0) continue // stale/broken mount: skip, like git prunable entries
			let branch: string | undefined, hash: string | undefined
			try {
				const j = JSON.parse(info.stdout)
				branch = j.branch
				hash = j.hash
			} catch {
				continue
			}
			const lines = [`worktree ${mnt}`, `HEAD ${hash ?? "0".repeat(40)}`]
			if (branch && !/^[0-9a-f]{40}$/.test(branch)) lines.push(`branch refs/heads/${branch}`)
			else lines.push("detached")
			blocks.push(lines)
		}
		if (!args.flags.has("--porcelain")) {
			// human table (loose): path  hash  [branch]
			return ok(blocks.map((b) => `${b[0]!.slice(9)}  ${b[1]!.slice(5, 17)} [${b[2]!.replace("branch refs/heads/", "")}]\n`).join(""))
		}
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
