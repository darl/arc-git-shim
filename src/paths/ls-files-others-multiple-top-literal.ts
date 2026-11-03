// Multiple root-anchored literal pathspecs select the union of untracked files.
import { arcJson, definePath, isExecResult, ok } from "../core"

export default definePath({
	name: "ls-files-others-multiple-top-literal",
	summary: "NUL-separated untracked files matching multiple root-anchored literal paths",
	spec: "ls-files --others --exclude-standard -z -- <first> <paths...>",
	refine: (args) => [args.pos.first!, ...args.list.paths!].every((path) =>
		/^:\(top,literal\)[^/]+(?:\/[^/]+)*$/.test(path) &&
		path.slice(14).split("/").every((part) => part !== "." && part !== "..")),

	async run(args, ctx) {
		const targets = [args.pos.first!, ...args.list.paths!].map((path) => path.slice(14))
		const parsed = await arcJson<{ status?: { untracked?: { path: string }[] } }>(
			ctx, ["status", "--json", "-u", "all"], { cwd: ctx.arcRoot },
		)
		if (isExecResult(parsed)) return parsed
		const cwd = ctx.cwd.slice(ctx.arcRoot.length).split("/").filter(Boolean)
		const files = (parsed.status?.untracked ?? [])
			.map((entry) => entry.path)
			.filter((path) => targets.some((target) => path === target || path.startsWith(target + "/")))
			.sort()
			.map((path) => {
				const parts = path.split("/")
				let common = 0
				while (common < cwd.length && common < parts.length && cwd[common] === parts[common]) common++
				return [...cwd.slice(common).map(() => ".."), ...parts.slice(common)].join("/")
			})
		return ok(files.length ? files.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "union of literal paths with overlap and unrelated files",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)dir", ":(top,literal)dir/a", ":(top,literal)other.txt"],
			arcReplies: { "status --json -u all": { stdout: '{"status":{"untracked":[{"path":"other.txt"},{"path":"dir/b"},{"path":"dir/a"},{"path":"dir-other/c"}]}}' } },
			want: { stdout: "dir/a\0dir/b\0other.txt\0", code: 0 },
		},
		{
			name: "root anchored paths from a subdirectory",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)dir", ":(top,literal)sub/file"],
			cwd: "/arcadia/sub",
			arcReplies: { "status --json -u all": { stdout: '{"status":{"untracked":[{"path":"dir/a"},{"path":"sub/file"}]}}' } },
			want: { stdout: "../dir/a\0file\0", code: 0 },
		},
		{
			name: "status failure propagates",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)a", ":(top,literal)b"],
			arcReplies: { "status --json -u all": { code: 1, stderr: "status failed\n" } },
			want: { stdout: "", stderr: "status failed\n", code: 1 },
		},
	],
})
