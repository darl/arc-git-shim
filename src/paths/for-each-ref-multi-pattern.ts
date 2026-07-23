// git for-each-ref --format=%(refname:short)%09(committerdate:unix) refs/heads refs/remotes
// Iterates refs matching TWO OR MORE patterns with a format that uses only
// basic placeholders — %(HEAD) %(refname) %(refname:short) — plus %XX byte
// escapes and literal text.  The incoming format is notable: "(committerdate:unix)"
// is LITERAL prose (no leading %), NOT the %(committerdate:unix) placeholder,
// so no per-ref date lookup is needed.
//
// Local + remote branches come from `arc branch -a --json` (GOLDEN entry
// shape: {"local":true,"name":"...","current":true?} for locals;
// {"name":"arcadia/..."} for remotes).  Refs are built as refs/heads/<name>
// and refs/remotes/<name>, filtered by glob patterns, sorted by refname
// (git for-each-ref default ordering), then rendered.
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), same as for-each-ref-committerdate which shares the
// "<patterns...>" shape.  Mutual exclusion:
//   • for-each-ref-committerdate.refine REQUIRES %(committerdate:unix) in
//     the format → it rejects our formats (basic placeholders only).
//   • Our refine REQUIRES ≥2 patterns AND all %(...) placeholders in
//     {HEAD,refname,refname:short} → we reject formats with
//     %(committerdate:unix) (not in our SUPPORTED set) and we reject
//     single-pattern argvs.
//   • for-each-ref-remotes / for-each-ref-heads declare a single positional,
//     so an argv with ≥2 patterns never structurally matches them.
//   • for-each-ref-sorted requires --sort, which our argv never carries.

import { arcJson, definePath, isExecResult, ok } from "../core"

const SUPPORTED = /^(HEAD|refname|refname:short)$/

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

const renderable = (fmt: string): boolean =>
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

function renderRef(fmt: string, refname: string, isCurrent: boolean): string {
	const short = shortRef(refname)
	return fmt
		.replace(/%\(([^)]*)\)/g, (_full: string, ph: string) => {
			if (ph === "HEAD") return isCurrent ? "*" : " "
			if (ph === "refname") return refname
			return short // refname:short
		})
		.replace(/%([0-9a-fA-F]{2})/g, (_full: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

export default definePath({
	name: "for-each-ref-multi-pattern",
	summary: "for-each-ref with ≥2 patterns and basic %(...) placeholders (no committerdate)",
	spec: "for-each-ref --format=<fmt> <patterns...>",
	refine: (args) => (args.list.patterns?.length ?? 0) >= 2 && renderable(args.pos.fmt!),

	async run(args, ctx) {
		const fmt = args.pos.fmt!
		const patterns = args.list.patterns ?? []

		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "-a", "--json"])
		if (isExecResult(entries)) return entries

		// Build ref objects: local → refs/heads/<name>, remote → refs/remotes/<name>
		let refs: { refname: string; current: boolean }[] = entries.map((e) => ({
			refname: e.local ? `refs/heads/${e.name}` : `refs/remotes/${e.name}`,
			current: !!e.current,
		}))

		// Filter by patterns (a ref matches if ANY pattern matches)
		refs = refs.filter((r) => patterns.some((p) => refMatches(p, r.refname)))

		// Sort by refname (git for-each-ref default ordering)
		refs.sort((a, b) => (a.refname < b.refname ? -1 : a.refname > b.refname ? 1 : 0))

		return ok(refs.map((r) => renderRef(fmt, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "short refname + tab + literal committerdate text for heads and remotes",
			argv: ["for-each-ref", "--format=%(refname:short)%09(committerdate:unix)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
					]),
				},
			},
			want: {
				stdout:
					"dev\t(committerdate:unix)\n" +
					"trunk\t(committerdate:unix)\n" +
					"arcadia/trunk\t(committerdate:unix)\n" +
					"arcadia/users/darl/foo\t(committerdate:unix)\n",
				code: 0,
			},
		},
		{
			name: "HEAD marker + full refname across heads and remotes",
			argv: ["for-each-ref", "--format=%(HEAD)%09%(refname)", "refs/heads", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev", current: true },
						{ local: true, name: "trunk" },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: {
				stdout:
					"*\trefs/heads/dev\n" +
					" \trefs/heads/trunk\n" +
					" \trefs/remotes/arcadia/trunk\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "refs/heads/nonexistent", "refs/remotes/nonexistent"],
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
