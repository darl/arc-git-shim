// git show [--stat] [<rev>] — commit prose, tier 3, arc show passthrough
// (--git for git-shaped patch text).
import { definePath, ok } from "../core"

export default definePath({
	name: "show-commit",
	summary: "commit details via arc show passthrough",
	spec: "show --stat? <rev>?",
	refine: (args) => !(args.pos.rev ?? "").includes(":"),

	async run(args, ctx) {
		const arcArgs = ["show", "--git"]
		if (args.flags.has("--stat")) arcArgs.push("--stat")
		if (args.pos.rev !== undefined) arcArgs.push(args.pos.rev)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "show HEAD with stat",
			argv: ["show", "--stat", "HEAD"],
			arcReplies: {
				"show --git --stat HEAD": {
					stdout: "commit a7819db\nAuthor: darl\n\n    subject\n\n foo.go | 2 +-\n",
				},
			},
			want: { stdout: "commit a7819db\nAuthor: darl\n\n    subject\n\n foo.go | 2 +-\n", code: 0 },
		},
		{
			name: "bare show",
			argv: ["show"],
			arcReplies: {
				"show --git": { stdout: "commit a7819db\n" },
			},
			want: { stdout: "commit a7819db\n", code: 0 },
		},
	],
})
