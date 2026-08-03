// git log --format=<fmt> [-n N] [range] (orca: --format=%s -n 5 a..b).
// Rendering and format:/tformat: newline policy live in src/gitlog.ts.
// Supported: %H %h %s %b %B %an %ae %ad %aI %aE %n %%; anything else →
// refine rejects → learnable.
import { arcJson, definePath, isExecResult, ok } from "../core"
import { joinRendered, type LogEntry, renderCommit, renderable, splitPretty } from "../gitlog"

export default definePath({
	name: "log-format",
	summary: "custom %-format log rendered from arc log --json",
	spec: "log (--format|--pretty)=<fmt> (-n|--max-count)=<num>? <range>?",
	refine: (args) => renderable(splitPretty(args.pos.fmt!).fmt),

	async run(args, ctx) {
		const { fmt, terminator } = splitPretty(args.pos.fmt!)
		const arcArgs = ["log", "--json"]
		if (args.pos.num !== undefined) arcArgs.push("-n", args.pos.num)
		if (args.pos.range !== undefined) arcArgs.push(args.pos.range)
		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries
		return ok(joinRendered(entries.map((e) => renderCommit(fmt, e)), terminator))
	},

	fixtures: [
		{
			name: "orca: subjects over a range",
			argv: ["log", "--format=%s", "-n", "5", "trunk..HEAD"],
			arcReplies: {
				"log --json -n 5 trunk..HEAD": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"subject one\\n\\nbody"},{"commit":"c79064cbea91ca389afe153a347d588452fe50df","author":"darl","date":"2026-06-30T23:14:47+03:00","message":"subject two"}]',
				},
			},
			want: { stdout: "subject one\nsubject two\n", code: 0 },
		},
		{
			name: "hash + short + author",
			argv: ["log", "--format=%H %h %an", "-n1"],
			arcReplies: {
				"log --json -n 1": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"m"}]',
				},
			},
			want: { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0 a7819db772ee darl\n", code: 0 },
		},
		{
			name: "explicit format: separates records without trailing newline",
			argv: ["log", "--pretty=format:%s", "-n", "2"],
			arcReplies: {
				"log --json -n 2": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"one"},{"commit":"c79064cbea91ca389afe153a347d588452fe50df","author":"darl","date":"2026-06-30T23:14:47+03:00","message":"two"}]',
				},
			},
			want: { stdout: "one\ntwo", code: 0 },
		},
		{
			name: "tformat: prefix is stripped, not rendered literally",
			argv: ["log", "--pretty=tformat:%s", "-n", "1"],
			arcReplies: {
				"log --json -n 1": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"one"}]',
				},
			},
			want: { stdout: "one\n", code: 0 },
		},
	],
})
