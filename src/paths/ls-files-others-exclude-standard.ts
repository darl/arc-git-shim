// git ls-files --others --exclude-standard [-z] — untracked, non-ignored
// files.  arc status --json -u all yields root-relative untracked paths that
// already respect .arcignore (verified: *.a from .arcignore does not appear),
// so it is a direct source for --others --exclude-standard.  git ls-files is
// cwd-scoped and cwd-relative; arc status always returns root-relative paths
// regardless of cwd, so the shim filters to the cwd subtree and rewrites.
import { arcJson, definePath, isExecResult, ok } from "../core"

interface UntrackedEntry {
	status: string
	path: string
}

export default definePath({
	name: "ls-files-others-exclude-standard",
	summary: "untracked non-ignored files, cwd-relative, optional NUL termination",
	spec: "ls-files --others --exclude-standard -z?",

	async run(args, ctx) {
		const parsed = await arcJson<{ status?: { untracked?: UntrackedEntry[] } }>(
			ctx,
			["status", "--json", "-u", "all"],
			{ cwd: ctx.arcRoot },
		)
		if (isExecResult(parsed)) return parsed

		const all = (parsed.status?.untracked ?? []).map((e) => e.path).sort()

		// arc status yields root-relative paths; git ls-files is scoped to the
		// cwd subtree and reports paths relative to cwd.
		let prefix = ""
		if (ctx.cwd !== ctx.arcRoot && ctx.cwd.startsWith(ctx.arcRoot + "/"))
			prefix = ctx.cwd.slice(ctx.arcRoot.length + 1) + "/"

		const files = prefix
			? all.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length))
			: all

		if (args.flags.has("-z"))
			return ok(files.length ? files.join("\0") + "\0" : "")
		return ok(files.length ? files.join("\n") + "\n" : "")
	},

	fixtures: [
		{
			name: "untracked files, newline-separated",
			argv: ["ls-files", "--others", "--exclude-standard"],
			arcReplies: {
				"status --json -u all": {
					stdout:
						'{"status":{"untracked":[{"status":"untracked","type":"file","path":"scratch/foo.txt"},{"status":"untracked","type":"file","path":"bar.tmp"}]}}',
				},
			},
			want: { stdout: "bar.tmp\nscratch/foo.txt\n", code: 0 },
		},
		{
			name: "untracked files, NUL-terminated",
			argv: ["ls-files", "--others", "--exclude-standard", "-z"],
			arcReplies: {
				"status --json -u all": {
					stdout:
						'{"status":{"untracked":[{"status":"untracked","type":"file","path":"scratch/foo.txt"},{"status":"untracked","type":"file","path":"bar.tmp"}]}}',
				},
			},
			want: { stdout: "bar.tmp\0scratch/foo.txt\0", code: 0 },
		},
		{
			name: "no untracked files, -z",
			argv: ["ls-files", "--others", "--exclude-standard", "-z"],
			arcReplies: {
				"status --json -u all": { stdout: '{"status":{}}' },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "scoped to cwd subdirectory",
			argv: ["ls-files", "--others", "--exclude-standard"],
			cwd: "/arcadia/sub",
			arcReplies: {
				"status --json -u all": {
					stdout:
						'{"status":{"untracked":[{"status":"untracked","type":"file","path":"sub/a.txt"},{"status":"untracked","type":"file","path":"sub/deep/b.txt"},{"status":"untracked","type":"file","path":"other/c.txt"}]}}',
				},
			},
			want: { stdout: "a.txt\ndeep/b.txt\n", code: 0 },
		},
	],
})
