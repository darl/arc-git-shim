// git commit — exit-code tier. Covers agents' staple shapes:
// -m / -q -m / -am / -a -m / --amend [--no-edit] [-m].
// arc commit has no -q; quiet is emulated by suppressing stdout.
import { definePath, ok } from "../core"

export default definePath({
	name: "commit",
	summary: "record changes via arc commit",
	spec: "commit (-a|--all)? (-q|--quiet)? --amend? (--no-edit|-n)? (-m|--message|-am)=<msg>? --no-verify?",
	// message-less commit would open arc's editor — only amend may omit -m
	refine: (args) => args.pos.msg !== undefined || args.flags.has("--amend"),

	async run(args, ctx) {
		const arcArgs = ["commit"]
		// -am is a value flag (-a + -m <msg> fused); it registers as flag "-am"
		if (args.flags.has("-a") || args.flags.has("--all") || args.flags.has("-am")) arcArgs.push("--all")
		if (args.flags.has("--amend")) arcArgs.push("--amend")
		if (args.flags.has("--no-edit") && args.pos.msg === undefined) arcArgs.push("--no-edit")
		if (args.pos.msg !== undefined) arcArgs.push("-m", args.pos.msg)
		if (args.flags.has("--no-verify")) arcArgs.push("--no-verify")
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return ok(args.flags.has("-q") || args.flags.has("--quiet") ? "" : r.stdout)
	},

	fixtures: [
		{
			name: "simple message",
			argv: ["commit", "-m", "fix the widget"],
			arcReplies: { "commit -m fix the widget": { stdout: "[feature-x 1a2b3c4] fix the widget\n" } },
			want: { stdout: "[feature-x 1a2b3c4] fix the widget\n", code: 0 },
		},
		{
			name: "-am combined flag",
			argv: ["commit", "-am", "quick fix"],
			arcReplies: { "commit --all -m quick fix": { stdout: "done\n" } },
			want: { stdout: "done\n", code: 0 },
		},
		{
			name: "quiet swallows stdout",
			argv: ["commit", "-q", "-m", "silent"],
			arcReplies: { "commit -m silent": { stdout: "noise\n" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "amend no-edit",
			argv: ["commit", "--amend", "--no-edit"],
			arcReplies: { "commit --amend --no-edit": { stdout: "amended\n" } },
			want: { stdout: "amended\n", code: 0 },
		},
	],
})
