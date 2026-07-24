// git commit — exit-code tier. Covers agents' staple shapes:
// -m / -q -m / -am / -a -m / --amend [--no-edit] [-m], with any number of
// -m/--message paragraphs (git joins them with blank lines; t3code passes
// title + each body line as separate -m flags).
// arc commit has no -q; quiet is emulated by suppressing stdout.
import { definePath, ok } from "../core"

export default definePath({
	name: "commit",
	summary: "record changes via arc commit",
	spec: "commit (-a|--all)? (-q|--quiet)? --amend? (--no-edit|-n)? (-m|--message|-am)=<msg...>? --no-verify?",
	// message-less commit would open arc's editor — only amend may omit -m
	refine: (args) => (args.list.msg?.length ?? 0) > 0 || args.flags.has("--amend"),

	async run(args, ctx) {
		const msgs = args.list.msg ?? []
		const arcArgs = ["commit"]
		// -am is a value flag (-a + -m <msg> fused); it registers as flag "-am"
		if (args.flags.has("-a") || args.flags.has("--all") || args.flags.has("-am")) arcArgs.push("--all")
		if (args.flags.has("--amend")) arcArgs.push("--amend")
		if (args.flags.has("--no-edit") && msgs.length === 0) arcArgs.push("--no-edit")
		if (msgs.length > 0) arcArgs.push("-m", msgs.join("\n\n"))
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
			name: "multiple -m paragraphs joined with blank lines",
			argv: ["commit", "-m", "title", "-m", "line 1", "-m", "line 2", "-m", "line 3"],
			arcReplies: {
				"commit -m title\n\nline 1\n\nline 2\n\nline 3": { stdout: "[b 1a2b3c4] title\n" },
			},
			want: { stdout: "[b 1a2b3c4] title\n", code: 0 },
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
