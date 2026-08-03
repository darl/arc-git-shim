// Shared %-placeholder rendering for the log path family. arc's --format
// uses {placeholder} syntax, not git's %X — so the shim renders git
// placeholders itself from arc log --json (GOLDEN fields: commit, parents,
// author, date (ISO), message, branches). Consolidated by hand from learned
// paths that each carried a copy. Like core.ts, this is shared code: pi adds
// path files, it does not edit this module.
import { SHORT_HASH_LEN } from "./core"

/** Supported git pretty-format placeholders; anything else in a format
 * should fail `renderable` so the shape stays learnable. */
export const PLACEHOLDER = /%(H|h|s|b|B|an|ae|aE|ad|aI|n|%)/g

export const renderable = (fmt: string): boolean => fmt.replace(PLACEHOLDER, "").indexOf("%") === -1

export interface LogEntry {
	commit: string
	parents?: string[]
	author: string
	date: string
	message: string
}

/** Strip git's pretty prefix and pick the record-joining policy: an explicit
 * "format:" SEPARATES records with \n (no trailing newline); "tformat:" and a
 * bare %-string (git treats it as tformat) TERMINATE every record with \n. */
export function splitPretty(raw: string): { fmt: string; terminator: boolean } {
	return { fmt: raw.replace(/^t?format:/, ""), terminator: !raw.startsWith("format:") }
}

export const joinRendered = (lines: string[], terminator: boolean): string =>
	terminator ? lines.map((l) => l + "\n").join("") : lines.join("\n")

/** ISO-with-offset → git default date: "Tue Jun 30 23:53:19 2026 +0300".
 * The ISO string carries wall-clock time in its own zone — parse textually,
 * never through local time. */
export function gitDate(iso: string): string {
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

/** Render one commit through a %-format (callers refine on `renderable`).
 * %ae/%aE are synthesized as <login>@yandex-team.ru — arc reports logins,
 * not emails. */
export function renderCommit(fmt: string, e: LogEntry): string {
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
}
