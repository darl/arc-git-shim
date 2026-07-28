// git log --no-merges --pretty=format:%s [-n N] [range]
// arc has no --no-merges option; the shim filters merge commits (parents
// array length > 1) from arc log --json client-side.  Because git's -n
// counts only non-merge commits while arc's -n counts all commits, the arc
// request uses a 3× multiplier on -n then slices the filtered result back to
// the requested limit.
//
// Format rendering mirrors log-format: git %X placeholders are rendered from
// arc log --json GOLDEN fields.  Supported: %H %h %s %b %B %an %ae %aE %ad
// %aI %n %%; anything else → refine rejects → learnable.
//
// format: (no trailing newline) vs tformat: (trailing newline) is respected,
// matching git's byte-exact porcelain behaviour.

import { arcJson, definePath, isExecResult, ok, SHORT_HASH_LEN } from "../core"

const PLACEHOLDER = /%(H|h|s|b|B|an|ae|aE|ad|aI|n|%)/g

const renderable = (fmt: string): boolean => fmt.replace(PLACEHOLDER, "").indexOf("%") === -1

interface LogEntry {
	commit: string
	parents?: string[]
	author: string
	date: string
	message: string
}

/** ISO-with-offset → git default date: "Tue Jun 30 23:53:19 2026 +0300". */
function gitDate(iso: string): string {
	const t = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
	if (!t) return iso
	const m = iso.match(/([+-]\d{2}):?(\d{2})$/)
	const off = m ? `${m[1]}${m[2]}` : "+0000"
	const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
	const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
	const [, Y, Mo, D, h, mi, s] = t
	const wall = new Date(Date.UTC(+Y!, +Mo! - 1, +D!, +h!, +mi!, +s!))
	return `${DAYS[wall.getUTCDay()]} ${MONTHS[wall.getUTCMonth()]} ${+D!} ${h}:${mi}:${s} ${Y} ${off}`
}

/** Multiplier on -n to compensate for merge commits that will be filtered
 * out client-side (Arcadia's trunk is merge-heavy). */
const MERGE_MULT = 3

export default definePath({
	name: "log-no-merges-format",
	summary: "log --no-merges with %-format, merge commits filtered client-side",
	spec: "log --no-merges (--format|--pretty)=<fmt> (-n|--max-count)=<num>? <range>?",
	refine: (args) => renderable(args.pos.fmt!.replace(/^t?format:/, "")),

	async run(args, ctx) {
		const raw = args.pos.fmt!
		const trailingNl = raw.startsWith("tformat:")
		const fmt = raw.replace(/^t?format:/, "")

		const arcArgs = ["log", "--json"]
		const limit = args.pos.num !== undefined ? parseInt(args.pos.num, 10) : undefined
		if (limit !== undefined) arcArgs.push("-n", String(limit * MERGE_MULT))
		if (args.pos.range !== undefined) arcArgs.push(args.pos.range)

		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries

		const nonMerges = entries.filter((e) => (e.parents?.length ?? 0) <= 1)
		const sliced = limit !== undefined ? nonMerges.slice(0, limit) : nonMerges
		if (sliced.length === 0) return ok("")

		const lines = sliced.map((e) => {
			const nl = e.message.indexOf("\n")
			const subject = nl === -1 ? e.message : e.message.slice(0, nl)
			const body = nl === -1 ? "" : e.message.slice(nl + 1).replace(/^\n+/, "")
			return fmt.replace(PLACEHOLDER, (_, ph: string) => {
				switch (ph) {
					case "H": return e.commit
					case "h": return e.commit.slice(0, SHORT_HASH_LEN)
					case "s": return subject
					case "b": return body
					case "B": return e.message
					case "an": return e.author
					case "ae": case "aE": return `${e.author}@yandex-team.ru`
					case "ad": return gitDate(e.date)
					case "aI": return e.date
					case "n": return "\n"
					default: return "%"
				}
			})
		})

		const body = lines.join("\n")
		return ok(trailingNl ? body + "\n" : body)
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
			name: "subjects over a range, --format= syntax",
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
			want: { stdout: "fix bug\nadd feature", code: 0 },
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
