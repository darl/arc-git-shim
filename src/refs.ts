// Shared machinery for the for-each-ref / branch-listing path family.
// Each of these paths was learned in isolation and once carried a private
// copy of this code (the learner writes one self-contained file and never
// edits shared modules); the verbatim copies were consolidated here by hand.
// Like core.ts, this is shared code: pi adds path files, it does not edit
// this module.
import { arcJson, type Ctx, type ExecResult } from "./core"

/** GOLDEN `arc branch [-a] [-v] --json` entry shape. Locals carry
 * {"local":true,"name":"…","current":true?}; remotes just {"name":"arcadia/…"};
 * -v adds tip-commit metadata ({id, date, …}). */
export interface BranchEntry {
	local?: boolean | null
	name: string
	current?: boolean
	commit?: { id?: string; date?: string }
}

/** One typed `arc branch … --json` call. Callers pick the flags they need
 * (-a for remotes, -v for tip-commit metadata). Dates for many refs must
 * come from ONE -v call, never a per-ref `arc log` N+1: t3code polls ref
 * snapshots several times a second, and ~134 refs at ~120ms each took ~16s
 * per poll (commit b6d0866). */
export const listBranches = (ctx: Ctx, ...flags: string[]): Promise<BranchEntry[] | ExecResult> =>
	arcJson<BranchEntry[]>(ctx, ["branch", ...flags, "--json"])

/** Git ref name of a branch entry: refs/heads/<name> or refs/remotes/<name>. */
export const entryRefname = (e: BranchEntry): string => (e.local ? `refs/heads/${e.name}` : `refs/remotes/${e.name}`)

/** Drop the refs/heads/ or refs/remotes/ prefix — git's %(refname:short). */
export function shortRef(refname: string): string {
	if (refname.startsWith("refs/heads/")) return refname.slice("refs/heads/".length)
	if (refname.startsWith("refs/remotes/")) return refname.slice("refs/remotes/".length)
	return refname
}

/** git for-each-ref default ordering. */
export const byRefname = (a: { refname: string }, b: { refname: string }): number =>
	a.refname < b.refname ? -1 : a.refname > b.refname ? 1 : 0

// --- git ref glob matching ---------------------------------------------------

/**
 * Match a ref against a git for-each-ref pattern.  Patterns containing
 * `*`, `?`, or `[` are glob-matched; others are prefix-matched (matching
 * the ref exactly or as a directory prefix).  `**` as a full path component
 * matches zero or more path components; `*` matches within a component.
 * (This is for-each-ref's per-component semantics — NOT the matcher for
 * `branch --list` or `ls-remote` patterns, which glob across `/`.)
 */
export function refMatches(pattern: string, ref: string): boolean {
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
	return wild(seg, 0, ref[ri]!, 0) && globMatch(pat, pi + 1, ref, ri + 1)
}

/** Single path component: `*` = any chars, `?` = one char, `[...]` = fnmatch
 * character class (ranges, `!`/`^` negation), else literal. */
function wild(pat: string, pi: number, str: string, si: number): boolean {
	if (pi === pat.length) return si === str.length
	const c = pat[pi]!
	if (c === "*") {
		for (let k = si; k <= str.length; k++) if (wild(pat, pi + 1, str, k)) return true
		return false
	}
	if (c === "?") return si < str.length && wild(pat, pi + 1, str, si + 1)
	if (c === "[") {
		// "]" as the first class char is literal, hence the +2 search start
		const end = pat.indexOf("]", pi + 2)
		if (end !== -1) {
			if (si >= str.length) return false
			let cls = pat.slice(pi + 1, end)
			let neg = false
			if (cls.startsWith("!") || cls.startsWith("^")) {
				neg = true
				cls = cls.slice(1)
			}
			let hit = false
			for (let k = 0; k < cls.length; k++) {
				if (cls[k + 1] === "-" && k + 2 < cls.length) {
					if (cls[k]! <= str[si]! && str[si]! <= cls[k + 2]!) hit = true
					k += 2
				} else if (cls[k] === str[si]) hit = true
			}
			if (hit === neg) return false
			return wild(pat, end + 1, str, si + 1)
		}
		// unterminated class: treat "[" as a literal, like fnmatch
	}
	return si < str.length && c === str[si] && wild(pat, pi + 1, str, si + 1)
}

// --- %(...) format rendering ---------------------------------------------------

/** Placeholders every family member supports. */
export const BASIC_PLACEHOLDERS = /^(HEAD|refname|refname:short)$/

/** True when every %(...) placeholder in fmt is in the supported set —
 * refine gates on this so unsupported placeholders stay learnable. */
export const renderable = (fmt: string, supported: RegExp): boolean =>
	[...fmt.matchAll(/%\(([^)]*)\)/g)].every((m) => supported.test(m[1]!))

/** Render one ref through a %(...) format: %(HEAD) current marker, long and
 * short refname, any extra placeholder values by name, then %XX byte escapes
 * (%09 tab, %00 NUL, %0a LF). Callers must refine on `renderable` first —
 * an unknown placeholder renders as "". */
export function renderRef(fmt: string, refname: string, current: boolean, extras?: Record<string, string>): string {
	const short = shortRef(refname)
	return fmt
		.replace(/%\(([^)]*)\)/g, (_full: string, ph: string) => {
			if (ph === "HEAD") return current ? "*" : " "
			if (ph === "refname") return refname
			if (ph === "refname:short") return short
			return extras?.[ph] ?? ""
		})
		.replace(/%([0-9a-fA-F]{2})/g, (_full: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

/** ISO-8601 (arc's date shape) → Unix-epoch seconds string ("" if unparseable). */
export const isoToUnix = (iso: string): string => {
	const ms = Date.parse(iso)
	return isNaN(ms) ? "" : String(Math.floor(ms / 1000))
}
