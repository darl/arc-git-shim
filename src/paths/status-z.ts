// git status -z [-b] [-uall|-uno|--untracked-files=…] — bare -z with no
// explicit --porcelain/-s. GOLDEN (probed on real git, 2026-09-13): -z
// IMPLIES the porcelain-v1 output format and NUL-terminates every entry,
// including the "## branch..." header, with no trailing LF. arc status -s
// already emits git's v1 entries LF-terminated with repo-root-relative
// paths (see status-porcelain-v1), so this path just rewrites the
// terminator. Run at the arc root so paths stay root-relative like git's.
import { definePath, forwardUntracked, ok } from "../core"

export default definePath({
	name: "status-z",
	summary: "bare -z status (implies porcelain v1, NUL-terminated) via arc status -s",
	// -z is the required distinguishing token; the other flags mirror the
	// optionals of status-porcelain-v1-z, which additionally requires an
	// explicit -s/--porcelain token and so never overlaps this shape.
	spec: "status -z (-b|--branch)? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const arcArgs = ["status", "-s"]
		if (args.flags.has("-b") || args.flags.has("--branch")) arcArgs.push("-b")
		forwardUntracked(args, arcArgs)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const lines = r.stdout.split("\n")
		if (lines[lines.length - 1] === "") lines.pop()
		return ok(lines.length ? lines.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "exact incoming command: -z -uall",
			argv: ["status", "-z", "-uall"],
			arcReplies: {
				"status -s -u all": {
					stdout: "?? dir/sub/file.txt\nA  staged.txt\n M dir/other.txt\n",
				},
			},
			want: { stdout: "?? dir/sub/file.txt\0A  staged.txt\0 M dir/other.txt\0", code: 0 },
		},
		{
			name: "clean tree prints nothing",
			argv: ["status", "-z"],
			arcReplies: { "status -s": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "branch header is NUL-terminated too",
			argv: ["status", "-z", "-b"],
			arcReplies: {
				"status -s -b": {
					stdout: "## users/darl/feature-x...arcadia/users/darl/feature-x\n?? scratch.txt\n",
				},
			},
			want: {
				stdout: "## users/darl/feature-x...arcadia/users/darl/feature-x\0?? scratch.txt\0",
				code: 0,
			},
		},
		{
			name: "long --untracked-files=no form",
			argv: ["status", "-z", "--untracked-files=no"],
			arcReplies: {
				"status -s -u no": { stdout: "A  staged.txt\n" },
			},
			want: { stdout: "A  staged.txt\0", code: 0 },
		},
		{
			name: "arc failure passes through",
			argv: ["status", "-z", "-uall"],
			arcReplies: {
				"status -s -u all": { stderr: "error: arc failed\n", code: 1 },
			},
			want: { stderr: "error: arc failed\n", code: 1 },
		},
	],
})
