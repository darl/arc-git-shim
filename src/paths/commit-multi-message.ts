// git commit -m <msg1> -m <msg2> [-m <msg3> …] — repeated -m flags create
// separate paragraphs joined by blank lines (git semantics). Arc commit -m
// accepts a single message, so we concatenate with "\n\n" and pass one -m.
// The single-message path (commit.ts) declares only one -m valueflag; this
// path declares two REQUIRED -m slots (specificity 3 > 1) so it wins on
// multi-message shapes and never collides with single-message forms.
import { definePath, ok } from "../core"

export default definePath({
	name: "commit-multi-message",
	summary: "multi-paragraph commit via repeated -m flags",
	spec: "commit (-a|--all)? (-q|--quiet)? --amend? (--no-edit|-n)? --no-verify? (-m|--message|-am)=<msg1> (-m|--message)=<msg2> *?",

	async run(args, ctx) {
		const messages: string[] = [args.pos.msg1!, args.pos.msg2!]
		let noVerify = args.flags.has("--no-verify")

		// Extra -m/--message pairs (and stray --no-verify) swallowed by *?
		const rest = args.list.rest ?? []
		for (let i = 0; i < rest.length; i++) {
			const a = rest[i]!
			if (a === "-m" || a === "--message") {
				const next = rest[++i]
				if (next !== undefined) messages.push(next)
			} else if (a.startsWith("--message=")) {
				messages.push(a.slice("--message=".length))
			} else if (a.startsWith("-m=")) {
				messages.push(a.slice(3))
			} else if (a.startsWith("-m") && a.length > 2) {
				messages.push(a.slice(2))
			} else if (a === "--no-verify") {
				noVerify = true
			}
		}

		const combined = messages.join("\n\n")
		const arcArgs = ["commit"]
		if (args.flags.has("-a") || args.flags.has("--all") || args.flags.has("-am")) arcArgs.push("--all")
		if (args.flags.has("--amend")) arcArgs.push("--amend")
		arcArgs.push("-m", combined)
		if (noVerify) arcArgs.push("--no-verify")

		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return ok(args.flags.has("-q") || args.flags.has("--quiet") ? "" : r.stdout)
	},

	fixtures: [
		{
			name: "two-paragraph commit with bullet body",
			argv: [
				"commit", "-m", "Remove obsolete legacy metrics conversion operation",
				"-m", "- Delete the unused operation implementation and package exports\n- Remove it from the build source list",
			],
			arcReplies: {
				"commit -m Remove obsolete legacy metrics conversion operation\n\n- Delete the unused operation implementation and package exports\n- Remove it from the build source list":
					{ stdout: "[feature-x 1a2b3c4] Remove obsolete legacy metrics conversion operation\n" },
			},
			want: { stdout: "[feature-x 1a2b3c4] Remove obsolete legacy metrics conversion operation\n", code: 0 },
		},
		{
			name: "title and body",
			argv: ["commit", "-m", "fix the widget", "-m", "details about the fix"],
			arcReplies: { "commit -m fix the widget\n\ndetails about the fix": { stdout: "[feature-x 1a2b3c4] fix the widget\n" } },
			want: { stdout: "[feature-x 1a2b3c4] fix the widget\n", code: 0 },
		},
		{
			name: "three messages joined by blank lines",
			argv: ["commit", "-m", "a", "-m", "b", "-m", "c"],
			arcReplies: { "commit -m a\n\nb\n\nc": { stdout: "[trunk 9d8e7f6] a\n" } },
			want: { stdout: "[trunk 9d8e7f6] a\n", code: 0 },
		},
		{
			name: "with --all",
			argv: ["commit", "-a", "-m", "title", "-m", "body"],
			arcReplies: { "commit --all -m title\n\nbody": { stdout: "[feature-x 2b3c4d5] title\n" } },
			want: { stdout: "[feature-x 2b3c4d5] title\n", code: 0 },
		},
		{
			name: "quiet suppresses stdout",
			argv: ["commit", "-q", "-m", "title", "-m", "body"],
			arcReplies: { "commit -m title\n\nbody": { stdout: "noise\n" } },
			want: { stdout: "", code: 0 },
		},
	],
})
