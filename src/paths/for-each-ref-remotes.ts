// git for-each-ref --format=%(refname) refs/remotes
// Lists remote-tracking refs under refs/remotes/.  Arc has no ref database;
// remote branches come from `arc branch -a --json` (entries without a
// `local` flag, names like "arcadia/trunk" → ref "refs/remotes/arcadia/trunk").
//
// Supported placeholders: %(HEAD) %(refname) %(refname:short) and %XX byte
// escapes (%09 tab, %0a LF).  Unsupported placeholders → refine rejects →
// learnable.
//
// Spec specificity is 2 (same as for-each-ref-heads "for-each-ref
// --format=<fmt> <pattern>?", which also has one required value-flag).
// No collision: for-each-ref-heads.refine rejects patterns not starting
// with "refs/heads", and our refine rejects patterns not starting with
// "refs/remotes" — the two never accept the same argv.

import { arcJson, definePath, isExecResult, ok } from "../core"

const SUPPORTED = /^(HEAD|refname|refname:short)$/

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

const renderable = (fmt: string): boolean =>
	[...fmt.matchAll(/%\(([^)]*)\)/g)].every((m) => SUPPORTED.test(m[1]!))

// --- git ref glob matching (mirrors for-each-ref-sorted) ------------------

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
	if (refname.startsWith("refs/remotes/")) return refname.slice("refs/remotes/".length)
	return refname
}

function renderRef(fmt: string, refname: string): string {
	const short = shortRef(refname)
	return fmt
		.replace(/%\(([^)]*)\)/g, (_full: string, ph: string) => {
			if (ph === "HEAD") return " " // remote refs are never the current HEAD
			if (ph === "refname") return refname
			return short // refname:short
		})
		.replace(/%([0-9a-fA-F]{2})/g, (_full: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

export default definePath({
	name: "for-each-ref-remotes",
	summary: "iterate remote-tracking refs (refs/remotes/) with a %(...) format",
	spec: "for-each-ref --format=<fmt> <pattern>",
	refine: (args) => args.pos.pattern!.startsWith("refs/remotes") && renderable(args.pos.fmt!),

	async run(args, ctx) {
		const fmt = args.pos.fmt!
		const pattern = args.pos.pattern!

		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "-a", "--json"])
		if (isExecResult(entries)) return entries

		// Remote entries: no `local` flag (or local:false).  Names are
		// already remote-prefixed, e.g. "arcadia/trunk".
		const remotes = entries
			.filter((e) => !e.local)
			.map((e) => `refs/remotes/${e.name}`)
			.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

		const matched = remotes.filter((ref) => refMatches(pattern, ref))
		return ok(matched.map((ref) => renderRef(fmt, ref) + "\n").join(""))
	},

	fixtures: [
		{
			name: "list all remote refs by full refname",
			argv: ["for-each-ref", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
						{ local: true, name: "dev" },
					]),
				},
			},
			want: {
				stdout: "refs/remotes/arcadia/trunk\nrefs/remotes/arcadia/users/darl/foo\n",
				code: 0,
			},
		},
		{
			name: "short refname for a glob pattern",
			argv: ["for-each-ref", "--format=%(refname:short)", "refs/remotes/arcadia/users/*"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/foo" },
						{ name: "arcadia/users/bar" },
					]),
				},
			},
			want: {
				stdout: "arcadia/users/bar\narcadia/users/foo\n",
				code: 0,
			},
		},
		{
			name: "no remote refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "refs/remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk", current: true }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
