// git stash [push|pop|list|apply|drop|show|clear] → arc stash has the same
// mode names (verified against arc stash --help). Prose tier.
import { definePath, ok } from "../core"

const MODES = new Set(["push", "pop", "list", "apply", "drop", "show", "clear"])

export default definePath({
	name: "stash",
	summary: "stash operations, arc stash passthrough",
	spec: "stash <mode>? (-m|--message)=<msg>?",
	refine: (args) => args.pos.mode === undefined || MODES.has(args.pos.mode),

	async run(args, ctx) {
		const arcArgs = ["stash"]
		if (args.pos.mode !== undefined) arcArgs.push(args.pos.mode)
		if (args.pos.msg !== undefined) arcArgs.push("-m", args.pos.msg)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "bare stash (push default)",
			argv: ["stash"],
			arcReplies: { stash: { stdout: "Saved working directory state\n" } },
			want: { stdout: "Saved working directory state\n", code: 0 },
		},
		{
			name: "pop",
			argv: ["stash", "pop"],
			arcReplies: { "stash pop": { stdout: "Dropped stash@{0}\n" } },
			want: { stdout: "Dropped stash@{0}\n", code: 0 },
		},
		{
			name: "list",
			argv: ["stash", "list"],
			arcReplies: { "stash list": { stdout: "stash@{0}: WIP on feature-x\n" } },
			want: { stdout: "stash@{0}: WIP on feature-x\n", code: 0 },
		},
	],
})
