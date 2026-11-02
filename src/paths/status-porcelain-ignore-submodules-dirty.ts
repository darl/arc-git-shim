// Arc has no git submodules, so ignoring their dirty worktrees is a no-op.
// Porcelain v1 uses root-relative paths; arc's short status has the same XY
// layout (although arc does not C-quote unusual pathnames).
import { definePath, forwardUntracked } from "../core"

export default definePath({
	name: "status-porcelain-ignore-submodules-dirty",
	summary: "porcelain status ignoring dirty submodules via arc short status",
	spec: "status --porcelain --ignore-submodules=dirty --untracked-files=normal",

	async run(args, ctx) {
		const arcArgs = ["status", "-s"]
		forwardUntracked(args, arcArgs)
		return ctx.arc(arcArgs, { cwd: ctx.arcRoot })
	},

	fixtures: [
		{
			name: "porcelain entries from a nested cwd",
			argv: ["status", "--porcelain", "--ignore-submodules=dirty", "--untracked-files=normal"],
			cwd: "/repo/dir/sub",
			arcReplies: { "status -s -u normal": { stdout: " M dir/file.txt\n?? new-dir/\n" } },
			want: { stdout: " M dir/file.txt\n?? new-dir/\n", code: 0 },
		},
		{
			name: "arc failure is preserved",
			argv: ["status", "--untracked-files=normal", "--ignore-submodules=dirty", "--porcelain"],
			arcReplies: { "status -s -u normal": { stderr: "error: status failed\n", code: 1 } },
			want: { stderr: "error: status failed\n", code: 1 },
		},
	],
})
