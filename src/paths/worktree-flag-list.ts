// git worktree --list — the flag-form alias of `git worktree list` (git's
// option parser routes `--list` on the bare `worktree` subcommand to the same
// list code path). Produces the identical human table / porcelain output.
// This is a distinct argv shape from `worktree list …` (bare word vs. literal
// flag), so the two specs never match the same invocation and cannot collide.
//
// The run logic mirrors worktree-list: mounts come from `arc unmount --list`,
// HEAD + branch per mount from `arc info --json` run inside each mount, and
// the caller's own mount is emitted first (orca keys "primary" off position).
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
	name: "worktree-flag-list",
	summary: "worktree --list flag-form alias of worktree list",
	spec: "worktree --list --porcelain? -z?",

	async run(args, ctx) {
		const lst = await ctx.arc(["unmount", "--list"])
		if (lst.code !== 0) return lst
		const mounts = parseMountList(lst.stdout)
		const infos = await Promise.all(
			mounts.map((mnt) => arcJson<{ branch?: string; hash?: string }>(ctx, ["info", "--json"], { cwd: mnt })),
		)
		const trees: { mnt: string; hash: string; branch?: string }[] = []
		for (let i = 0; i < mounts.length; i++) {
			const j = infos[i]!
			if (isExecResult(j)) continue
			trees.push({
				mnt: mounts[i]!,
				hash: j.hash ?? "0".repeat(40),
				branch: isDetached(j.branch) ? undefined : j.branch,
			})
		}
		trees.sort((a, b) => Number(b.mnt === ctx.arcRoot) - Number(a.mnt === ctx.arcRoot))
		if (!args.flags.has("--porcelain")) {
			return ok(
				trees.map((t) => `${t.mnt}  ${t.hash.slice(0, SHORT_HASH_LEN)} [${t.branch ?? "detached"}]\n`).join(""),
			)
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
			name: "human table for --list flag form",
			argv: ["worktree", "--list"],
			arcReplies: {
				"unmount --list": {
					stdout:
						"[unmounted] mount: /Users/darl/old store: /s/old object_store: /s/old/.arc/objects\n[mounted, pid: 57290] mount: /Users/darl/arcadia store: /s/a object_store: /s/a/.arc/objects\n",
				},
				"info --json": {
					stdout:
						'{"branch":"users/darl/task-1","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: {
				stdout: "/Users/darl/arcadia  a7819db772ee [users/darl/task-1]\n",
				code: 0,
			},
		},
		{
			name: "porcelain blocks via flag form",
			argv: ["worktree", "--list", "--porcelain"],
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
			name: "NUL-delimited porcelain via flag form",
			argv: ["worktree", "--list", "--porcelain", "-z"],
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
