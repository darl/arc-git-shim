// git for-each-ref --format=%(refname:short)%09%(committerdate:unix) refs/heads refs/remotes
// Lists refs matching one or more patterns, formatted with %(...) placeholders
// including %(committerdate:unix) — the Unix-epoch committer timestamp.
// Local + remote branches come from `arc branch -a --json`; per-ref commit
// dates come from `arc log --json -n 1 <branch>`.
//
// Supported placeholders: %(HEAD) %(refname) %(refname:short)
// %(committerdate:unix) and %XX byte escapes (%09 tab, %00 NUL, etc.).
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), same as for-each-ref-remotes and for-each-ref-heads.  The key
// disambiguator is the %(committerdate:unix) placeholder:
//   • Existing paths' SUPPORTED set excludes committerdate:unix, so their
//     refine REJECTS any format containing it → they hand off to us.
//   • Our refine REQUIRES %(committerdate:unix) to be present, so we REJECT
//     formats that only use HEAD/refname/refname:short → we never steal
//     their fixtures.
// Additionally, for-each-ref-remotes and for-each-ref-heads declare a single
// positional, so an argv with ≥2 patterns never structurally matches them;
// for-each-ref-sorted requires --sort, which our argv never carries.

import { arcJson, definePath, isExecResult, ok } from "../core"

const SUPPORTED = /^(HEAD|refname|refname:short|committerdate:unix)$/

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

interface LogEntry {
	commit: string
	date: string
}

const renderable = (fmt: string): boolean =>
	/%\(committerdate:unix\)/.test(fmt) &&
	[...fmt.matchAll(/%\(([^)]*)\)/g)].every((m) => SUPPORTED.test(m[1]!))

// --- git ref glob matching (mirrors existing for-each-ref paths) ----------

function refMatches(pattern: string, ref: string): boolean {
	const p = pattern.replace(/\/+$/, "")
	if (!/[*?\[]/.test(p)) return ref === p || ref.startsWith(p + "/")
	return globMatch(p.split("/"), 0, ref.split("/"), 0)
}

function globMatch(pat: string[], pi: number, ref: string[], ri: number): boolean {
	if (pi === pat.length) return ri === ref.length
	const seg = pat[pi]!
	if (seg === "**") {
		for (let k = ri; k <= ref.length; k++) if (globMatch(pat, pi + 1, ref, k)) return true
		return false
	}
	if (ri === ref.length) return false
	return compMatch(seg, ref[ri]!) && globMatch(pat, pi + 1, ref, ri + 1)
}

function compMatch(pat: string, str: string): boolean {
	return wild(pat, 0, str, 0)
}

function wild(pat: string, pi: number, str: string, si: number): boolean {
	if (pi === pat.length) return si === str.length
	const c = pat[pi]!
	if (c === "*") {
		for (let k = si; k <= str.length; k++) if (wild(pat, pi + 1, str, k)) return true
		return false
	}
	if (c === "?") return si < str.length && wild(pat, pi + 1, str, si + 1)
	return si < str.length && c === str[si] && wild(pat, pi + 1, str, si + 1)
}

// --- helpers ---------------------------------------------------------------

function shortRef(refname: string): string {
	if (refname.startsWith("refs/heads/")) return refname.slice("refs/heads/".length)
	if (refname.startsWith("refs/remotes/")) return refname.slice("refs/remotes/".length)
	return refname
}

/** Convert an ISO-8601 arc date to a Unix-epoch seconds string. */
function toUnix(iso: string): string {
	const ms = Date.parse(iso)
	return isNaN(ms) ? "" : String(Math.floor(ms / 1000))
}

function renderRef(fmt: string, refname: string, isCurrent: boolean, unixDate: string): string {
	const short = shortRef(refname)
	return fmt
		.replace(/%\(([^)]*)\)/g, (_full: string, ph: string) => {
			if (ph === "HEAD") return isCurrent ? "*" : " "
			if (ph === "refname") return refname
			if (ph === "committerdate:unix") return unixDate
			return short // refname:short
		})
		.replace(/%([0-9a-fA-F]{2})/g, (_full: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

export default definePath({
	name: "for-each-ref-committerdate",
	summary: "for-each-ref with %(committerdate:unix) and variadic patterns",
	spec: "for-each-ref --format=<fmt> <patterns...>",
	refine: (args) => renderable(args.pos.fmt!),

	async run(args, ctx) {
		const fmt = args.pos.fmt!
		const patterns = args.list.patterns ?? []

		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "-a", "--json"])
		if (isExecResult(entries)) return entries

		// Build ref objects: local → refs/heads/<name>, remote → refs/remotes/<name>
		let refs: { refname: string; branch: string; current: boolean }[] = entries.map((e) => ({
			refname: e.local ? `refs/heads/${e.name}` : `refs/remotes/${e.name}`,
			branch: e.name,
			current: !!e.current,
		}))

		// Filter by patterns (a ref matches if ANY pattern matches)
		refs = refs.filter((r) => patterns.some((p) => refMatches(p, r.refname)))

		// Sort by refname (git for-each-ref default ordering)
		refs.sort((a, b) => (a.refname < b.refname ? -1 : a.refname > b.refname ? 1 : 0))

		// Fetch committer date for each ref via arc log --json -n 1
		const lines: string[] = []
		for (const r of refs) {
			const log = await arcJson<LogEntry[]>(ctx, ["log", "--json", "-n", "1", r.branch])
			if (isExecResult(log)) return log
			const unixDate = toUnix(log[0]?.date ?? "")
			lines.push(renderRef(fmt, r.refname, r.current, unixDate) + "\n")
		}

		return ok(lines.join(""))
	},

	fixtures: [
		{
			name: "short refname + tab + unix committerdate for heads and remotes",
			argv: ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
					]),
				},
				"log --json -n 1 dev": {
					stdout: JSON.stringify([{ commit: "aaa", date: "2026-07-20T12:00:00+03:00" }]),
				},
				"log --json -n 1 trunk": {
					stdout: JSON.stringify([{ commit: "bbb", date: "2026-07-21T09:30:00+03:00" }]),
				},
				"log --json -n 1 arcadia/trunk": {
					stdout: JSON.stringify([{ commit: "ccc", date: "2026-07-21T09:30:00+03:00" }]),
				},
				"log --json -n 1 arcadia/users/darl/foo": {
					stdout: JSON.stringify([{ commit: "ddd", date: "2026-07-19T18:00:00+03:00" }]),
				},
			},
			want: {
				stdout:
					"dev\t1784538000\n" +
					"trunk\t1784615400\n" +
					"arcadia/trunk\t1784615400\n" +
					"arcadia/users/darl/foo\t1784473200\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads/nonexistent"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
