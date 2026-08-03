// git status -s / --porcelain[=v1] [-b] [-uall].
// GOLDEN: arc status -s already emits git's XY format ("?? path", "A  path")
// with repo-root-relative paths, and -b emits "## branch...upstream" — both
// captured from real arc. Run at the arc root so paths stay root-relative
// (git porcelain paths are always root-relative).
// QUOTING (verified on real arc, 2026-08-03, space + Cyrillic probe): arc
// never C-quotes paths — output equals git under core.quotepath=off (bare
// UTF-8), not git's default octal escaping. The shim swallows -c, so callers
// passing `-c core.quotepath=off` (t3code does) get exactly what they asked.
import { definePath, forwardUntracked } from "../core"

export default definePath({
	name: "status-porcelain-v1",
	summary: "short/porcelain-v1 status via arc status -s passthrough",
	spec: "status (-s|--short|--porcelain|--porcelain=v1) (-b|--branch)? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const arcArgs = ["status", "-s"]
		if (args.flags.has("-b") || args.flags.has("--branch")) arcArgs.push("-b")
		forwardUntracked(args, arcArgs)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		return r
	},

	fixtures: [
		{
			name: "untracked file (golden arc shape)",
			argv: ["status", "--porcelain"],
			arcReplies: {
				"status -s": { stdout: "?? junk/darl/scratch.txt\n" },
			},
			want: { stdout: "?? junk/darl/scratch.txt\n", code: 0 },
		},
		{
			name: "short with branch header (golden arc shape)",
			argv: ["status", "-s", "-b"],
			arcReplies: {
				"status -s -b": {
					stdout: "## pr-12345678...arcadia/users/darl/submit-1234\n?? junk/darl/scratch.txt\n",
				},
			},
			want: {
				stdout: "## pr-12345678...arcadia/users/darl/submit-1234\n?? junk/darl/scratch.txt\n",
				code: 0,
			},
		},
		{
			name: "untracked-files=all forwarded",
			argv: ["status", "--porcelain", "--untracked-files=all"],
			arcReplies: {
				"status -s -u all": { stdout: "A  junk/darl/staged.txt\n" },
			},
			want: { stdout: "A  junk/darl/staged.txt\n", code: 0 },
		},
	],
})
