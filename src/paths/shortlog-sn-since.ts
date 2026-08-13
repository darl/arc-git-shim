// git shortlog -sn [--no-merges] --since=<date> [<rev>]
// Summarizes commits per author, sorted by commit count descending (-sn).
// arc has no shortlog command; the shim enumerates arc log --json (filtered
// by --after, the arc equivalent of git's --since), counts commits per
// author login, optionally filters merge commits client-side (arc has no
// --no-merges), and renders git's "%6d\t<author>\n" format.
//
// Relative dates ("90 days ago") are converted to absolute YYYY-MM-DD
// because arc's --after rejects git's relative date syntax. Absolute dates
// pass through unchanged. Fixtures use absolute dates so the canned-arc
// reply keys are deterministic; the relative-date conversion is simple
// calendar math verified by inspection.
import { arcJson, arcRev, definePath, isExecResult, ok } from "../core"
import type { LogEntry } from "../gitlog"

/** Convert git relative date ("N <unit> ago", "yesterday") to YYYY-MM-DD
 * for arc's --after. Absolute dates pass through unchanged. */
function toArcAfter(since: string): string {
	const m = since.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i)
	if (m) {
		const n = parseInt(m[1]!, 10)
		const unit = m[2]!.toLowerCase()
		const now = new Date()
		if (unit === "month") now.setMonth(now.getMonth() - n)
		else if (unit === "year") now.setFullYear(now.getFullYear() - n)
		else {
			const ms: Record<string, number> = {
				second: 1_000,
				minute: 60_000,
				hour: 3_600_000,
				day: 86_400_000,
				week: 604_800_000,
			}
			now.setTime(now.getTime() - n * ms[unit]!)
		}
		return now.toISOString().slice(0, 10)
	}
	if (/^yesterday$/i.test(since)) {
		return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
	}
	return since
}

export default definePath({
	name: "shortlog-sn-since",
	summary: "commit count per author sorted by number, filtered by date",
	spec: "shortlog -sn --no-merges? --since=<date> <rev>?",

	async run(args, ctx) {
		const after = toArcAfter(args.pos.date!)
		const arcArgs = ["log", "--json", `--after=${after}`]
		if (args.pos.rev !== undefined) arcArgs.push(arcRev(args.pos.rev))

		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries

		let commits = entries
		if (args.flags.has("--no-merges")) {
			commits = commits.filter((e) => (e.parents?.length ?? 0) <= 1)
		}

		// Count per author, preserving first-appearance order (arc log is
		// reverse-chronological, so first appearance = most recent commit).
		const counts = new Map<string, number>()
		for (const e of commits) {
			counts.set(e.author, (counts.get(e.author) ?? 0) + 1)
		}

		// Sort by count descending; ties keep first-appearance order (stable).
		const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])

		return ok(sorted.map(([author, n]) => `${String(n).padStart(6, " ")}\t${author}\n`).join(""))
	},

	fixtures: [
		{
			name: "counts per author with --no-merges and origin alias",
			argv: ["shortlog", "-sn", "--since=2026-01-15", "--no-merges", "origin/trunk"],
			arcReplies: {
				"log --json --after=2026-01-15 arcadia/trunk": {
					stdout: JSON.stringify([
						{ commit: "aaa1", parents: ["x"], author: "darl", date: "2026-06-01T10:00:00+03:00", message: "fix bug" },
						{ commit: "bbb2", parents: ["y", "z"], author: "darl", date: "2026-05-20T12:00:00+03:00", message: "merge trunk" },
						{ commit: "ccc3", parents: ["w"], author: "darl", date: "2026-05-15T14:00:00+03:00", message: "add feature" },
						{ commit: "ddd4", parents: ["v"], author: "alex", date: "2026-05-10T09:00:00+03:00", message: "refactor" },
						{ commit: "eee5", parents: ["u", "t"], author: "alex", date: "2026-05-01T08:00:00+03:00", message: "merge dev" },
					]),
				},
			},
			want: { stdout: "     2\tdarl\n     1\talex\n", code: 0 },
		},
		{
			name: "without --no-merges includes merge commits",
			argv: ["shortlog", "-sn", "--since=2026-01-15", "arcadia/trunk"],
			arcReplies: {
				"log --json --after=2026-01-15 arcadia/trunk": {
					stdout: JSON.stringify([
						{ commit: "aaa1", parents: ["x"], author: "darl", date: "2026-06-01T10:00:00+03:00", message: "fix bug" },
						{ commit: "bbb2", parents: ["y", "z"], author: "darl", date: "2026-05-20T12:00:00+03:00", message: "merge trunk" },
						{ commit: "ccc3", parents: ["w"], author: "alex", date: "2026-05-15T14:00:00+03:00", message: "refactor" },
					]),
				},
			},
			want: { stdout: "     2\tdarl\n     1\talex\n", code: 0 },
		},
		{
			name: "empty result outputs nothing",
			argv: ["shortlog", "-sn", "--since=2026-01-15", "--no-merges", "arcadia/trunk"],
			arcReplies: {
				"log --json --after=2026-01-15 arcadia/trunk": { stdout: "[]" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "default rev (HEAD) when no rev given",
			argv: ["shortlog", "-sn", "--since=2026-01-15", "--no-merges"],
			arcReplies: {
				"log --json --after=2026-01-15": {
					stdout: JSON.stringify([
						{ commit: "aaa1", parents: ["x"], author: "darl", date: "2026-06-01T10:00:00+03:00", message: "fix bug" },
					]),
				},
			},
			want: { stdout: "     1\tdarl\n", code: 0 },
		},
		{
			name: "space-separated --since value form",
			argv: ["shortlog", "-sn", "--since", "2026-03-01", "--no-merges", "trunk"],
			arcReplies: {
				"log --json --after=2026-03-01 trunk": {
					stdout: JSON.stringify([
						{ commit: "fff6", parents: ["p"], author: "sam", date: "2026-04-01T10:00:00+03:00", message: "init" },
						{ commit: "ggg7", parents: ["q"], author: "sam", date: "2026-03-20T10:00:00+03:00", message: "update" },
						{ commit: "hhh8", parents: ["r"], author: "joe", date: "2026-03-15T10:00:00+03:00", message: "patch" },
					]),
				},
			},
			want: { stdout: "     2\tsam\n     1\tjoe\n", code: 0 },
		},
	],
})
