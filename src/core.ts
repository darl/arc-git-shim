// Portable core: types + spec engine + dispatcher. Pure — no I/O, no process
// access. Arc reaches paths only through the injected Ctx.
//
// Matching design ("match = parse"): a path declares a one-line git-synopsis
// SPEC compiled to a STRICT parser — every argv token must be accounted for,
// or the path does not match. Unknown shapes fall through to the learning
// trigger; a path can never silently swallow a shape it did not declare.
//
// Spec grammar (space-separated tokens after the literal subcommand):
//   --flag              required literal flag
//   --flag?             optional literal flag
//   (-s|--short)        required one-of literals          (…)? optional one-of
//   --uf=(all|no)?      literal-prefixed value set (sugar for a one-of group)
//   --format=<fmt>      flag with captured value: accepts --format=X and
//                       --format X (and -n5 for short flags); (-n|--max)=<v>
//                       declares a one-of value flag
//   <name>              required positional, captured     <name>? optional
//   <name...>           variadic positional (must be last); <name...>? optional
//   word                bare word = required sub-subcommand literal
//                       ("worktree add …"); counts toward specificity
//   *                   rest-of-anything: swallows ALL remaining tokens,
//                       flags included (for codified-fatal catch-alls); *?
//   --                  literal separator; everything after it parses as
//                       positionals even if it starts with "-"
// Precedence: specificity = 1 + number of REQUIRED flag/value-flag tokens;
// ties across matching paths are a codegen-time error, never file order.

export interface ExecResult {
	stdout: string
	stderr: string
	code: number
}

export interface ArcOpts {
	/** Run arc at this cwd instead of ctx.cwd (e.g. ctx.arcRoot for `arc show`). */
	cwd?: string
}

export interface Ctx {
	/** Effective cwd of the git invocation (after -C). */
	cwd: string
	/** Absolute path of the arc working-tree root (dir containing .arc). */
	arcRoot: string
	/** Injected arc executor — real subprocess in prod, canned in tests. */
	arc(args: string[], opts?: ArcOpts): Promise<ExecResult>
	/** Shim-local config store (per arc root); persisted by the entry point. */
	config: Map<string, string>
}

/** Result of a successful spec parse, handed to run(). */
export interface Args {
	argv: string[]
	/** Literal flags present. Value flags register their literal (e.g. "-n"). */
	flags: Set<string>
	/** Captured single positionals and value-flag values, by <name>. */
	pos: Record<string, string>
	/** Captured variadic positionals, by <name>. */
	list: Record<string, string[]>
}

export interface Fixture {
	name: string
	/** git argv, after "git". */
	argv: string[]
	/** Canned arc replies, keyed by arc argv joined with " ". */
	arcReplies: Record<string, Partial<ExecResult>>
	want: { stdout?: string; stderr?: string; code: number }
	/** Override the fixture Ctx cwd (default: the canned arc root). */
	cwd?: string
	/** Pre-seed the shim-local config store. */
	config?: Record<string, string>
}

export interface Path {
	name: string
	summary: string
	/** Git-synopsis matcher; see grammar above. */
	spec: string
	/** Optional semantic narrowing after a structural parse. */
	refine?(args: Args): boolean
	run(args: Args, ctx: Ctx): Promise<ExecResult>
	fixtures: Fixture[]
}

export const definePath = (p: Path): Path => p

export const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "", code: 0 })
export const fail = (code: number, stderr: string): ExecResult => ({ stdout: "", stderr, code })

/** git's "unknown revision" fatal, byte-shaped like the real one. */
export const badRevision = (rev: string): ExecResult =>
	fail(
		128,
		`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\n` +
			`Use '--' to separate paths from revisions, like this:\n` +
			`'git <command> [<revision>...] -- [<file>...]'\n`,
	)

/** Length of `git rev-parse --short` output the shim emits (fixed: the
 * monorepo makes "shortest unique" impractical to compute per call). */
export const SHORT_HASH_LEN = 12

// ---------------------------------------------------------------- spec engine

interface SpecToken {
	kind: "flag" | "valueflag" | "positional" | "word" | "rest"
	required: boolean
	literals?: string[] // flag/valueflag: acceptable literal tokens
	name?: string // positional / valueflag capture name; word: the literal
	variadic?: boolean // positional: capture all remaining
}

export interface CompiledSpec {
	subcommand: string
	tokens: SpecToken[]
	specificity: number
}

const isShortFlag = (lit: string) => /^-[a-zA-Z]$/.test(lit)

export function compileSpec(spec: string): CompiledSpec {
	const parts = spec.trim().split(/\s+/)
	const subcommand = parts.shift()
	if (!subcommand || subcommand.startsWith("-")) throw new Error(`spec must start with subcommand: ${spec}`)
	const tokens: SpecToken[] = []
	for (let raw of parts) {
		const required = !raw.endsWith("?")
		if (!required) raw = raw.slice(0, -1)
		let m: RegExpMatchArray | null
		if (raw.startsWith("<") && raw.endsWith(">")) {
			const inner = raw.slice(1, -1)
			const variadic = inner.endsWith("...")
			tokens.push({ kind: "positional", required, name: variadic ? inner.slice(0, -3) : inner, variadic })
		} else if ((m = raw.match(/^(.+)=<([\w-]+)>$/))) {
			// value flag: --format=<fmt> or (-n|--max-count)=<num>
			const lits = m[1]!.startsWith("(") && m[1]!.endsWith(")") ? m[1]!.slice(1, -1).split("|") : [m[1]!]
			tokens.push({ kind: "valueflag", required, literals: lits, name: m[2]! })
		} else if (raw.startsWith("(") && raw.endsWith(")")) {
			tokens.push({ kind: "flag", required, literals: raw.slice(1, -1).split("|") })
		} else if ((m = raw.match(/^(-{1,2}[\w-]+=)\((.+)\)$/))) {
			// enum sugar --k=(a|b): literals are full tokens
			tokens.push({ kind: "flag", required, literals: m[2]!.split("|").map((v) => m![1] + v) })
		} else if (raw === "*") {
			tokens.push({ kind: "rest", required })
		} else if (!raw.startsWith("-")) {
			// bare word: sub-subcommand literal ("worktree ADD …")
			tokens.push({ kind: "word", required, name: raw })
		} else {
			tokens.push({ kind: "flag", required, literals: [raw] })
		}
	}
	const vIdx = tokens.findIndex((t) => t.variadic)
	if (vIdx !== -1 && tokens.slice(vIdx + 1).some((t) => t.kind === "positional"))
		throw new Error(`variadic positional must be the last positional: ${spec}`)
	const specificity =
		1 + tokens.filter((t) => t.required && (t.kind === "flag" || t.kind === "valueflag" || t.kind === "word")).length
	return { subcommand, tokens, specificity }
}

/** Strict parse: null unless EVERY argv token is consumed by the spec. */
export function parseSpec(c: CompiledSpec, argv: string[]): Args | null {
	if (argv[0] !== c.subcommand) return null
	const rest = argv.slice(1)
	const flags = new Set<string>()
	const pos: Record<string, string> = {}
	const list: Record<string, string[]> = {}
	const flagToks = c.tokens.filter((t) => t.kind === "flag")
	const valueToks = c.tokens.filter((t) => t.kind === "valueflag")
	const posToks = c.tokens.filter((t) => t.kind === "positional")
	const wordToks = c.tokens.filter((t) => t.kind === "word")
	const restTok = c.tokens.find((t) => t.kind === "rest")
	const used = new Set<SpecToken>()
	let posIdx = 0
	let sawDashDash = false
	let swallowing = false

	const takePositional = (a: string): boolean => {
		const t = posToks[posIdx]
		if (!t) return false
		if (t.variadic) (list[t.name!] ??= []).push(a)
		else {
			pos[t.name!] = a
			posIdx++
		}
		used.add(t)
		return true
	}

	// a declared `*` swallows everything from the first token nothing else takes
	const swallow = (a: string): boolean => {
		if (!restTok) return false
		swallowing = true
		used.add(restTok)
		;(list.rest ??= []).push(a)
		return true
	}

	for (let i = 0; i < rest.length; i++) {
		const a = rest[i]!
		if (swallowing) {
			;(list.rest ??= []).push(a)
			continue
		}
		if (sawDashDash || !a.startsWith("-") || a === "-") {
			const wt = wordToks.find((t) => !used.has(t) && t.name === a && !sawDashDash)
			if (wt) {
				used.add(wt)
				flags.add(a)
				continue
			}
			if (!takePositional(a) && !swallow(a)) return null
			continue
		}
		if (a === "--") {
			const t = flagToks.find((t) => !used.has(t) && t.literals!.includes("--"))
			if (!t) return null // "--" not declared → no match
			used.add(t)
			flags.add("--")
			sawDashDash = true
			continue
		}
		const ft = flagToks.find((t) => !used.has(t) && t.literals!.includes(a))
		if (ft) {
			used.add(ft)
			flags.add(a)
			continue
		}
		const vt = valueToks.find(
			(t) =>
				!used.has(t) &&
				t.literals!.some(
					(lit) => a === lit || a.startsWith(lit + "=") || (isShortFlag(lit) && a.startsWith(lit) && a.length > 2),
				),
		)
		if (vt) {
			const lit = vt.literals!.find(
				(lit) => a === lit || a.startsWith(lit + "=") || (isShortFlag(lit) && a.startsWith(lit) && a.length > 2),
			)!
			let value: string
			if (a === lit) {
				const next = rest[++i]
				if (next === undefined) return null // value flag without value → no match
				value = next
			} else if (a.startsWith(lit + "=")) value = a.slice(lit.length + 1)
			else value = a.slice(lit.length)
			used.add(vt)
			flags.add(lit)
			pos[vt.name!] = value
			continue
		}
		if (swallow(a)) continue
		return null // undeclared flag → no match (fall through to learning)
	}

	for (const t of c.tokens) {
		if (!t.required || used.has(t)) continue
		if (t.kind !== "positional" || !t.variadic) {
			if (t.kind === "positional" && !t.variadic && pos[t.name!] !== undefined) continue
			return null
		}
		if (!list[t.name!]?.length) return null
	}
	// required non-variadic positionals: ensure all consumed
	for (const t of posToks) if (t.required && !t.variadic && pos[t.name!] === undefined) return null
	return { argv, flags, pos, list }
}

// ---------------------------------------------------------------- dispatcher

/** Strip git global flags the shim handles itself; return [argv, effectiveCwd]. */
export function stripGlobalFlags(argv: string[], cwd: string): [string[], string] {
	const out: string[] = []
	let effCwd = cwd
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!
		if (out.length === 0) {
			// global flags only appear before the subcommand
			if (a === "-C") {
				effCwd = argv[++i] ?? effCwd
				continue
			}
			if (a === "-c") {
				i++ // per-invocation config: swallowed (config store is shim-local)
				continue
			}
			if (a === "--no-pager" || a === "--no-optional-locks" || a === "--literal-pathspecs") continue
		}
		out.push(a)
	}
	return [out, effCwd]
}

export type Dispatch =
	| { kind: "matched"; path: Path; args: Args; specificity: number }
	| { kind: "ambiguous"; names: string[] } // codegen-time error in the real shim
	| { kind: "unknown" } // → learning trigger

export function dispatch(paths: Path[], argv: string[]): Dispatch {
	let best: { path: Path; args: Args; specificity: number }[] = []
	for (const p of paths) {
		const c = compileSpec(p.spec)
		const args = parseSpec(c, argv)
		if (!args || (p.refine && !p.refine(args))) continue
		if (!best[0] || c.specificity > best[0].specificity) best = [{ path: p, args, specificity: c.specificity }]
		else if (c.specificity === best[0].specificity) best.push({ path: p, args, specificity: c.specificity })
	}
	if (best.length === 1) return { kind: "matched", ...best[0]! }
	if (best.length > 1) return { kind: "ambiguous", names: best.map((b) => b.path.name) }
	return { kind: "unknown" }
}

/** Codegen-time gate: every fixture argv must dispatch uniquely to its OWN path. */
export function checkCollisions(paths: Path[]): string[] {
	const issues: string[] = []
	for (const p of paths)
		for (const fx of p.fixtures) {
			const d = dispatch(paths, fx.argv)
			if (d.kind === "ambiguous") issues.push(`AMBIGUOUS ${p.name}/${fx.name}: ${d.names.join(" vs ")}`)
			else if (d.kind === "unknown")
				issues.push(`OWN-SPEC MISS ${p.name}/${fx.name}: fixture argv does not match its own spec`)
			else if (d.path.name !== p.name) issues.push(`STOLEN ${p.name}/${fx.name}: dispatched to ${d.path.name}`)
		}
	return issues
}

// ------------------------------------------------------- shared arc helpers
// Read-only helpers paths may import. Shared code stays small and stable —
// pi adds path files, it does not edit this module.

export interface ArcInfo {
	branch?: string
	hash?: string
	/** Upstream branch name WITHOUT the remote prefix, e.g. "users/darl/foo". */
	remote?: string
	user_login?: string
	[k: string]: unknown
}

export async function arcInfo(ctx: Ctx): Promise<ArcInfo | ExecResult> {
	const r = await ctx.arc(["info", "--json"])
	if (r.code !== 0) return r
	try {
		return JSON.parse(r.stdout) as ArcInfo
	} catch {
		return fail(128, `fatal: arc-git: unparseable arc info --json output\n`)
	}
}

export const isExecResult = (v: unknown): v is ExecResult =>
	typeof v === "object" && v !== null && "code" in v && "stdout" in v

/** Count commits in an arc range via one-line-per-commit log output. */
export async function countRange(ctx: Ctx, range: string): Promise<number | ExecResult> {
	const r = await ctx.arc(["log", "--format={commit}", range])
	if (r.code !== 0) return r
	const s = r.stdout.trim()
	return s === "" ? 0 : s.split("\n").length
}

/** The asymmetric ref lens, push side: inject users/<login>/ unless present. */
export const pushLens = (branch: string, login: string): string =>
	branch.startsWith("users/") || branch === "trunk" ? branch : `users/${login}/${branch}`

/** Map an arc status --json entry status word to a git XY letter. */
export const statusLetter = (word: string): string =>
	(({ "new file": "A", modified: "M", deleted: "D", renamed: "R", copied: "C" }) as Record<string, string>)[word] ??
	"M"
