// git status --renames --porcelain=v1 -z [-u…].
// --renames is git's default (detect renames in status); arc status -s never
// detects renames, so it already emits separate A/D entries — the flag is a
// no-op.  -z NUL-terminates each entry instead of LF and disables C-quoting.
// Sibling of status-porcelain-v1-z; this path requires --renames (specificity
// 4 vs 3) so the two never collide on the same argv.
import { definePath, ok } from "../core"

export default definePath({
	name: "status-porcelain-v1-z-renames",
	summary: "porcelain-v1 status with --renames and -z (NUL-terminated) via arc status -s",
	spec: "status --renames (-s|--short|--porcelain|--porcelain=v1) -z --no-renames? (-b|--branch)? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const arcArgs = ["status", "-s"]
		if (args.flags.has("-b") || args.flags.has("--branch")) arcArgs.push("-b")
		const u = [...args.flags].find((f) => f.startsWith("--untracked-files=") || f.startsWith("-u"))
		if (u) arcArgs.push("-u", u.replace(/^(--untracked-files=|-u)/, ""))
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		// -z: NUL-terminate each entry instead of LF.
		return ok(r.stdout.replace(/\n/g, "\0"))
	},

	fixtures: [
		{
			name: "exact incoming command: --renames --porcelain=v1 -z -u=no",
			argv: ["status", "--renames", "--porcelain=v1", "-z", "--untracked-files=no"],
			arcReplies: {
				"status -s -u no": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "renames with untracked entry",
			argv: ["status", "--renames", "--porcelain", "-z"],
			arcReplies: {
				"status -s": { stdout: "?? proj/subproj/XXX\n" },
			},
			want: { stdout: "?? proj/subproj/XXX\0", code: 0 },
		},
		{
			name: "renames with staged and untracked entries",
			argv: ["status", "--renames", "--short", "-z"],
			arcReplies: {
				"status -s": { stdout: "A  junk/darl/staged.txt\n?? junk/darl/scratch.txt\n" },
			},
			want: { stdout: "A  junk/darl/staged.txt\0?? junk/darl/scratch.txt\0", code: 0 },
		},
		{
			name: "renames with branch header and -b",
			argv: ["status", "--renames", "--porcelain=v1", "-z", "-b"],
			arcReplies: {
				"status -s -b": {
					stdout: "## pr-12345678...arcadia/users/darl/submit-1234\n?? junk/darl/scratch.txt\n",
				},
			},
			want: {
				stdout: "## pr-12345678...arcadia/users/darl/submit-1234\0?? junk/darl/scratch.txt\0",
				code: 0,
			},
		},
		{
			name: "renames and no-renames both present (git allows, last wins)",
			argv: ["status", "--renames", "--no-renames", "--porcelain=v1", "-z"],
			arcReplies: {
				"status -s": { stdout: "A  junk/darl/staged.txt\n" },
			},
			want: { stdout: "A  junk/darl/staged.txt\0", code: 0 },
		},
	],
})
