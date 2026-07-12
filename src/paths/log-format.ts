// git log --format=<fmt> [-n N] [range] (orca: --format=%s -n 5 a..b).
// arc's --format uses {placeholder} syntax, not git's %X — so the shim renders
// git placeholders itself from arc log --json (GOLDEN fields: commit, parents,
// author, date (ISO), message, branches). Supported: %H %h %s %b %B %an %ae
// %ad %aI %aE %n %%; anything else → refine rejects → learnable.
import { arcJson, definePath, isExecResult, ok, SHORT_HASH_LEN } from "../core"

const PLACEHOLDER = /%(H|h|s|b|B|an|ae|aE|ad|aI|n|%)/g

const renderable = (fmt: string): boolean => fmt.replace(PLACEHOLDER, "").indexOf("%") === -1

interface LogEntry {
	commit: string
	author: string
	date: string
	message: string
}

/** ISO-with-offset → git default date: "Tue Jun 30 23:53:19 2026 +0300".
 * The ISO string carries wall-clock time in its own zone — parse textually,
 * never through local time. */
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

export default definePath({
	name: "log-format",
	summary: "custom %-format log rendered from arc log --json",
	spec: "log (--format|--pretty)=<fmt> (-n|--max-count)=<num>? <range>?",
	refine: (args) => renderable(args.pos.fmt!.replace(/^format:/, "")),

	async run(args, ctx) {
		const fmt = args.pos.fmt!.replace(/^format:/, "")
		const arcArgs = ["log", "--json"]
		if (args.pos.num !== undefined) arcArgs.push("-n", args.pos.num)
		if (args.pos.range !== undefined) arcArgs.push(args.pos.range)
		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries
		const lines = entries.map((e) => {
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
		return ok(lines.map((l) => l + "\n").join(""))
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
	],
})
