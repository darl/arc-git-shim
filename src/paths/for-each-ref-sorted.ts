// git for-each-ref --format=… --sort=-committerdate --exclude=… --count=N <patterns…>
// Lists refs matching glob patterns, sorted (by commit date or refname),
// optionally excluded and count-limited, formatted per git %(...) placeholders.
//
// Local + remote branches come from `arc branch -a --json` (GOLDEN entry
// shape: {"local":true,"name":"…","current":true?} for locals,
// {"name":"arcadia/…"} for remotes).  Supported placeholders: %(HEAD)
// %(refname) %(refname:short) and %XX byte escapes (%00 NUL, %09 TAB).
// Unsupported placeholders → refine rejects → learnable.
//
// Spec requires --sort to bump specificity above for-each-ref-heads (which
// has spec "for-each-ref --format=<fmt> <pattern>?", specificity 2); our
// specificity is 3 so we win on overlap and never collide.

import { arcJson, definePath, isExecResult, ok } from "../core"

const SUPPORTED = /^(HEAD|refname|refname:short)$/
const SORTABLE = /^-?(committerdate|refname)$/

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
	[...fmt.matchAll(/%\(([^)]*)\)/g)].every((m) => SUPPORTED.test(m[1]!))

// --- git ref glob matching -------------------------------------------------

/**
 * Match a ref against a git for-each-ref pattern.  Patterns containing
 * `*`, `?`, or `[` are glob-matched; others are prefix-matched (matching
 * the ref exactly or as a directory prefix).  `**` as a full path component
 * matches zero or more path components; `*` matches within a component.
 */
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

/** Match a single path component: `*` = any chars, `?` = one char, else literal. */
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
	name: "for-each-ref-sorted",
	summary: "for-each-ref with --sort, optional --exclude/--count, and variadic patterns",
	spec: "for-each-ref --format=<fmt> --sort=<field> --exclude=<exclude>? --count=<count>? <patterns...>?",
	refine: (args) => renderable(args.pos.fmt!) && SORTABLE.test(args.pos.field!),

	async run(args, ctx) {
		const fmt = args.pos.fmt!
		const sortField = args.pos.field!
		const patterns = args.list.patterns ?? []
		const excludePattern = args.pos.exclude
		const count = args.pos.count ? parseInt(args.pos.count, 10) : undefined
		// (capture names match spec: <exclude> → pos.exclude, <count> → pos.count)

		// 1. Fetch all branches (local + remote)
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "-a", "--json"])
		if (isExecResult(entries)) return entries

		// 2. Build ref objects
		let refs: { refname: string; branch: string; current: boolean }[] = entries.map((e) => ({
			refname: e.local ? `refs/heads/${e.name}` : `refs/remotes/${e.name}`,
			branch: e.name,
			current: !!e.current,
		}))

		// 3. Filter by include patterns (empty patterns = all refs)
		if (patterns.length > 0) refs = refs.filter((r) => patterns.some((p) => refMatches(p, r.refname)))

		// 4. Apply exclude pattern
		if (excludePattern) refs = refs.filter((r) => !refMatches(excludePattern, r.refname))

		// 5. Sort
		const descending = sortField.startsWith("-")
		const field = descending ? sortField.slice(1) : sortField

		if (field === "committerdate") {
			const dated: { ref: (typeof refs)[number]; date: string }[] = []
			for (const r of refs) {
				const log = await arcJson<LogEntry[]>(ctx, ["log", "--json", "-n", "1", r.branch])
				if (isExecResult(log)) return log
				dated.push({ ref: r, date: log[0]?.date ?? "" })
			}
			dated.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
			refs = dated.map((d) => d.ref)
			if (descending) refs.reverse()
		} else {
			refs.sort((a, b) => (a.refname < b.refname ? -1 : a.refname > b.refname ? 1 : 0))
			if (descending) refs.reverse()
		}

		// 6. Apply count limit
		if (count !== undefined && !isNaN(count)) {
			if (count <= 0) refs = []
			else refs = refs.slice(0, count)
		}

		// 7. Format output
		return ok(refs.map((r) => renderRef(fmt, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "trunk refs sorted by committerdate desc with NUL-separated format",
			argv: [
				"for-each-ref",
				"--format=%(refname)%00%(refname:short)",
				"--sort=-committerdate",
				"--exclude=refs/remotes/**/HEAD",
				"--count=80",
				"refs/heads/**/*trunk*",
				"refs/heads/**/*trunk*/**",
				"refs/remotes/**/*trunk*",
				"refs/remotes/**/*trunk*/**",
			],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk" },
						{ local: true, name: "other-branch", current: true },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/other" },
					]),
				},
				"log --json -n 1 trunk": {
					stdout: JSON.stringify([{ commit: "aaa", date: "2026-07-10T15:42:48+03:00" }]),
				},
				"log --json -n 1 arcadia/trunk": {
					stdout: JSON.stringify([{ commit: "bbb", date: "2026-07-11T10:00:00+03:00" }]),
				},
			},
			want: {
				stdout: "refs/remotes/arcadia/trunk\x00arcadia/trunk\nrefs/heads/trunk\x00trunk\n",
				code: 0,
			},
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(refname)", "--sort=refname", "refs/heads/**/*nonexistent*"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk" }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "count limit truncates sorted results",
			argv: ["for-each-ref", "--format=%(refname:short)", "--sort=refname", "--count=1", "refs/heads/*"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "ccc" },
						{ local: true, name: "aaa" },
						{ local: true, name: "bbb" },
					]),
				},
			},
			want: { stdout: "aaa\n", code: 0 },
		},
	],
})
