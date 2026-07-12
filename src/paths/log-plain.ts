// Plain / --oneline / -n / range log — tier 3 prose, arc log passthrough.
// (arc --oneline prints full hashes where git prints short ones; prose tier.)
// interactive: bare `git log` is UNBOUNDED (whole trunk history) — on a TTY
// arc inherits the terminal and streams/pages itself; captured otherwise.
import { definePath, ok } from "../core"

export default definePath({
	name: "log-plain",
	summary: "prose log via arc log passthrough",
	spec: "log --oneline? (-n|--max-count)=<num>? --stat? <range>?",

	async run(args, ctx) {
		const arcArgs = ["log"]
		if (args.flags.has("--oneline")) arcArgs.push("--oneline")
		if (args.flags.has("--stat")) arcArgs.push("--stat")
		if (args.pos.num !== undefined) arcArgs.push("-n", args.pos.num)
		if (args.pos.range !== undefined) arcArgs.push(args.pos.range)
		const r = await ctx.arc(arcArgs, { interactive: true })
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "oneline with count",
			argv: ["log", "--oneline", "-n", "3"],
			arcReplies: {
				"log --oneline -n 3": {
					stdout:
						"a7819db772eed4b7b5a49b558b22f185464b80a0 (HEAD -> pr-12345678) ytpoolctl: simplify\nc79064cbea91ca389afe153a347d588452fe50df ytpoolctl: Phase 4\n02415cf07dd38a9279f2a40679cb31e2fd1fc5cd ytpoolctl: Phase 3\n",
				},
			},
			want: {
				stdout:
					"a7819db772eed4b7b5a49b558b22f185464b80a0 (HEAD -> pr-12345678) ytpoolctl: simplify\nc79064cbea91ca389afe153a347d588452fe50df ytpoolctl: Phase 4\n02415cf07dd38a9279f2a40679cb31e2fd1fc5cd ytpoolctl: Phase 3\n",
				code: 0,
			},
		},
		{
			name: "range log (CLAUDE.md idiom: log trunk..HEAD)",
			argv: ["log", "trunk..HEAD"],
			arcReplies: {
				"log trunk..HEAD": { stdout: "commit a7819db...\nAuthor: darl\n\n    subject\n" },
			},
			want: { stdout: "commit a7819db...\nAuthor: darl\n\n    subject\n", code: 0 },
		},
	],
})
