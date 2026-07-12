// git status -sb  (combined short flag = -s -b). The spec engine treats "-sb"
// as a single argv token, so the porcelain-v1 path — which declares -s and -b
// as separate one-of literals — does not match. Arc accepts -sb natively, and
// arc status -s -b already emits git's "## branch...upstream" header + XY
// porcelain lines with repo-root-relative paths. Run at the arc root so paths
// stay root-relative (git porcelain paths are always root-relative).
import { definePath, ok } from "../core"

export default definePath({
	name: "status-sb",
	summary: "status -sb / -bs (combined -s -b) via arc status -s -b passthrough",
	spec: "status (-sb|-bs) (-uall|-uno)? --untracked-files=(all|no|normal)?",

	async run(args, ctx) {
		const arcArgs = ["status", "-s", "-b"]
		const u = [...args.flags].find((f) => f.startsWith("--untracked-files=") || f.startsWith("-u"))
		if (u) arcArgs.push("-u", u.replace(/^(--untracked-files=|-u)/, ""))
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "clean tree with branch header (golden arc shape)",
			argv: ["status", "-sb"],
			arcReplies: {
				"status -s -b": {
					stdout: "## pr-12345678...arcadia/users/darl/submit-1234\n",
				},
			},
			want: { stdout: "## pr-12345678...arcadia/users/darl/submit-1234\n", code: 0 },
		},
		{
			name: "untracked file with branch header (golden arc shape)",
			argv: ["status", "-sb"],
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
			name: "reversed flag order -bs",
			argv: ["status", "-bs"],
			arcReplies: {
				"status -s -b": {
					stdout: "## trunk\n",
				},
			},
			want: { stdout: "## trunk\n", code: 0 },
		},
		{
			name: "combined with -uno forwarded",
			argv: ["status", "-sb", "-uno"],
			arcReplies: {
				"status -s -b -u no": { stdout: "## trunk\n" },
			},
			want: { stdout: "## trunk\n", code: 0 },
		},
	],
})
