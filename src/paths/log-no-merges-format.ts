// git log --no-merges --pretty=format:%s [-n N] [range]
// arc has no --no-merges option; the shim filters merge commits (parents
// array length > 1) from arc log --json client-side.  Because git's -n
// counts only non-merge commits while arc's -n counts all commits, the arc
// request uses a 3× multiplier on -n then slices the filtered result back to
// the requested limit.
//
// Rendering and format:/tformat: newline policy live in src/gitlog.ts.
// Supported: %H %h %s %b %B %an %ae %aE %ad %aI %n %%; anything else →
// refine rejects → learnable.
import { arcJson, arcRevRange, definePath, isExecResult, ok } from "../core"
import { joinRendered, type LogEntry, renderCommit, renderable, splitPretty } from "../gitlog"

/** Multiplier on -n to compensate for merge commits that will be filtered
 * out client-side (Arcadia's trunk is merge-heavy). */
const MERGE_MULT = 3

export default definePath({
	name: "log-no-merges-format",
	summary: "log --no-merges with %-format, merge commits filtered client-side",
	spec: "log --no-merges (--format|--pretty)=<fmt> (-n|--max-count)=<num>? <range>?",
	refine: (args) => renderable(splitPretty(args.pos.fmt!).fmt),

	async run(args, ctx) {
		const { fmt, terminator } = splitPretty(args.pos.fmt!)

		const arcArgs = ["log", "--json"]
		const limit = args.pos.num !== undefined ? parseInt(args.pos.num, 10) : undefined
		if (limit !== undefined) arcArgs.push("-n", String(limit * MERGE_MULT))
		if (args.pos.range !== undefined) arcArgs.push(arcRevRange(args.pos.range))

		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries

		const nonMerges = entries.filter((e) => (e.parents?.length ?? 0) <= 1)
		const sliced = limit !== undefined ? nonMerges.slice(0, limit) : nonMerges
		return ok(joinRendered(sliced.map((e) => renderCommit(fmt, e)), terminator))
	},

	fixtures: [
		{
			name: "subjects, merges filtered (triggering command)",
			argv: ["log", "-n", "20", "--no-merges", "--pretty=format:%s"],
			arcReplies: {
				"log --json -n 60": {
					stdout: JSON.stringify([
						{ commit: "aaa", parents: ["x"], author: "darl", date: "2026-07-28T14:53:44+03:00", message: "subject one" },
						{ commit: "bbb", parents: ["y", "z"], author: "darl", date: "2026-07-24T16:40:40+03:00", message: "merge trunk" },
						{ commit: "ccc", parents: ["x"], author: "darl", date: "2026-07-24T16:40:38+03:00", message: "subject two" },
					]),
				},
			},
			want: { stdout: "subject one\nsubject two", code: 0 },
		},
		{
			name: "bare --format= behaves as tformat (terminating newlines)",
			argv: ["log", "--no-merges", "--format=%s", "trunk..HEAD"],
			arcReplies: {
				"log --json trunk..HEAD": {
					stdout: JSON.stringify([
						{ commit: "aaa", parents: ["x"], author: "darl", date: "2026-07-28T14:53:44+03:00", message: "fix bug" },
						{ commit: "bbb", parents: ["y", "z"], author: "darl", date: "2026-07-24T16:40:40+03:00", message: "merge trunk" },
						{ commit: "ccc", parents: ["x"], author: "darl", date: "2026-07-24T16:40:38+03:00", message: "add feature" },
					]),
				},
			},
			want: { stdout: "fix bug\nadd feature\n", code: 0 },
		},
		{
			name: "tformat adds trailing newline",
			argv: ["log", "--no-merges", "--pretty=tformat:%s", "-n", "5"],
			arcReplies: {
				"log --json -n 15": {
					stdout: JSON.stringify([
						{ commit: "aaa", parents: ["x"], author: "darl", date: "2026-07-28T14:53:44+03:00", message: "alpha" },
						{ commit: "bbb", parents: ["x"], author: "darl", date: "2026-07-24T16:40:40+03:00", message: "beta" },
					]),
				},
			},
			want: { stdout: "alpha\nbeta\n", code: 0 },
		},
		{
			name: "all merges filtered to empty output",
			argv: ["log", "--no-merges", "--pretty=format:%s", "-n", "10"],
			arcReplies: {
				"log --json -n 30": {
					stdout: JSON.stringify([
						{ commit: "aaa", parents: ["x", "y"], author: "darl", date: "2026-07-28T14:53:44+03:00", message: "merge one" },
						{ commit: "bbb", parents: ["x", "z"], author: "darl", date: "2026-07-24T16:40:40+03:00", message: "merge two" },
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
