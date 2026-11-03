// Root-anchored literal pathspecs select untracked files or directory trees.
import { arcJson, definePath, isExecResult, ok } from "../core"

export default definePath({
	name: "ls-files-others-top-literal",
	summary: "NUL-separated untracked files matching a root-anchored literal path",
	spec: "ls-files --others --exclude-standard -z -- <path>",
	refine: (args) => /^:\(top,literal\)[^/]+(?:\/[^/]+)*$/.test(args.pos.path!) &&
		args.pos.path!.slice(14).split("/").every((part) => part !== "." && part !== ".."),

	async run(args, ctx) {
		const target = args.pos.path!.slice(14)
		const parsed = await arcJson<{ status?: { untracked?: { path: string }[] } }>(
			ctx, ["status", "--json", "-u", "all"], { cwd: ctx.arcRoot },
		)
		if (isExecResult(parsed)) return parsed
		const cwd = ctx.cwd.slice(ctx.arcRoot.length).split("/").filter(Boolean)
		const files = (parsed.status?.untracked ?? [])
			.map((entry) => entry.path)
			.filter((path) => path === target || path.startsWith(target + "/"))
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
			name: "literal filename excludes unrelated untracked files",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)result.json"],
			arcReplies: { "status --json -u all": { stdout: '{"status":{"untracked":[{"status":"untracked","type":"file","path":"result.json"},{"status":"untracked","type":"file","path":"other.json"}]}}' } },
			want: { stdout: "result.json\0", code: 0 },
		},
		{
			name: "root anchored directory from a subdirectory",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)dir"],
			cwd: "/arcadia/sub",
			arcReplies: { "status --json -u all": { stdout: '{"status":{"untracked":[{"path":"dir/b"},{"path":"dir/a"},{"path":"dir-other/c"}]}}' } },
			want: { stdout: "../dir/a\0../dir/b\0", code: 0 },
		},
		{
			name: "no matching untracked file",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)missing"],
			arcReplies: { "status --json -u all": { stdout: '{"status":{}}' } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "arc failure propagates",
			argv: ["ls-files", "--others", "--exclude-standard", "-z", "--", ":(top,literal)file"],
			arcReplies: { "status --json -u all": { code: 1, stderr: "status failed\n" } },
			want: { code: 1, stderr: "status failed\n", stdout: "" },
		},
	],
})
