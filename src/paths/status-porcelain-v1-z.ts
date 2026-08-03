// git status --porcelain=v1 -z [--renames|--no-renames] [-b] [-u…].
// -z NUL-terminates each entry (instead of LF) and disables C-quoting of
// paths.  VERIFIED on real arc (2026-08-03, space + Cyrillic probe): arc
// status -s never C-quotes, so the plain LF→NUL swap yields exactly git's
// -z bytes — no unquoting needed.  --renames/--no-renames are both no-ops:
// arc status -s never detects renames, so it already emits separate A/D
// entries.  We run arc status -s (same as the non-z porcelain-v1 path) and
// swap every LF for NUL.
import { definePath, forwardUntracked, ok } from "../core"

export default definePath({
	name: "status-porcelain-v1-z",
	summary: "porcelain-v1 status with -z (NUL-terminated) via arc status -s",
	spec: "status --renames? (-s|--short|--porcelain|--porcelain=v1) -z --no-renames? (-b|--branch)? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const arcArgs = ["status", "-s"]
		if (args.flags.has("-b") || args.flags.has("--branch")) arcArgs.push("-b")
		forwardUntracked(args, arcArgs)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		// -z: NUL-terminate each entry instead of LF.
		return ok(r.stdout.replace(/\n/g, "\0"))
	},

	fixtures: [
		{
			name: "exact incoming command: --no-renames --porcelain=v1 -z -u=normal",
			argv: ["status", "--no-renames", "--porcelain=v1", "-z", "--untracked-files=normal"],
			arcReplies: {
				"status -s -u normal": { stdout: "?? proj/subproj/XXX\n" },
			},
			want: { stdout: "?? proj/subproj/XXX\0", code: 0 },
		},
		{
			name: "porcelain -z with staged and untracked entries",
			argv: ["status", "--porcelain", "-z"],
			arcReplies: {
				"status -s": { stdout: "A  junk/darl/staged.txt\n?? junk/darl/scratch.txt\n" },
			},
			want: { stdout: "A  junk/darl/staged.txt\0?? junk/darl/scratch.txt\0", code: 0 },
		},
		{
			name: "short -z with branch header",
			argv: ["status", "-s", "-z", "-b"],
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
			name: "clean repo produces empty output",
			argv: ["status", "--porcelain=v1", "-z"],
			arcReplies: {
				"status -s": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "--renames (git's default, a no-op for arc) with -u=no",
			argv: ["status", "--renames", "--porcelain=v1", "-z", "--untracked-files=no"],
			arcReplies: {
				"status -s -u no": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
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
