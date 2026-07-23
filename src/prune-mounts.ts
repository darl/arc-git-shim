// `git arc-shim prune-mounts` — GC for abandoned arc mounts (not a git
// impersonation; git has no such command, and `worktree prune` stays at
// exact git parity — it only forgets records whose mount dir is gone).
//
// Policy (design session, approved): the safe axis is EVACUATION, not age.
// A mount is prunable only when nothing exists solely inside it:
//   dirty tree            → keep, always
//   unpushed commits      → keep, always
//   detached HEAD         → keep (manual review; commits may be unreachable)
//   PR merged/discarded   → prune when idle > --min-idle (default 14d)
//   PR open               → prune only when idle > --open-pr-idle (default 180d)
//   no PR                 → prune when idle > --min-idle (default 14d)
// Idle = no mtime anywhere in the mount's private store newer than the
// cutoff (early-exit walk; a walk cap counts as ACTIVE — safety first).
// [unmounted] entries are NEVER auto-pruned — only reported (inspecting
// them would require a remount; decision: report-only).
// Protected: the primary store (~/.arc/store) and any path listed in
// ~/.arc-git/config.json "protectedMounts".
//
// Apply mode is opt-in (--apply); default is a dry-run report. Apply
// sequencing per prunable mount: plain `arc unmount` FIRST — its busy
// refusal (holder PIDs) is the exact in-use detector, and a busy mount is
// kept — then `arc unmount --forget` (drops record + store; local branches
// die with the store, the arcadia remote branch survives). A pruned path
// is also removed from arc-wt's state.json so its remount service does not
// resurrect the worktree with a fresh empty store.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const DAY_MS = 24 * 60 * 60_000
const WALK_CAP = 200_000

export interface MountEntry {
	mounted: boolean
	path: string
	store: string
}

/** Parse `arc unmount --list` lines:
 * "[mounted, pid: N] mount: P store: S object_store: O" / "[unmounted] …" */
export function parseInventory(out: string): MountEntry[] {
	const entries: MountEntry[] = []
	for (const line of out.split("\n")) {
		if (!line.startsWith("[")) continue
		const m = line.match(/^\[(mounted|unmounted)[^\]]*\] mount: (.*?) store: (.*?) object_store: /)
		if (m) entries.push({ mounted: m[1] === "mounted", path: m[2]!, store: m[3]! })
	}
	return entries
}

export type PrState = "none" | "open" | "merged" | "discarded"

export interface MountFacts {
	isProtected: boolean
	detached: boolean
	dirty: boolean
	unpushed: boolean
	pr: PrState
	/** true when the store shows activity newer than the cutoff that applies
	 * to this PR state (open PR → --open-pr-idle, else --min-idle) */
	activeWithinCutoff: boolean
}

export interface Verdict {
	action: "prune" | "keep"
	reason: string
}

export function decide(f: MountFacts, opts: { minIdleDays: number; openPrIdleDays: number }): Verdict {
	if (f.isProtected) return { action: "keep", reason: "protected" }
	if (f.detached) return { action: "keep", reason: "detached HEAD (manual review)" }
	if (f.dirty) return { action: "keep", reason: "dirty tree" }
	if (f.unpushed) return { action: "keep", reason: "unpushed commits" }
	const days = f.pr === "open" ? opts.openPrIdleDays : opts.minIdleDays
	const tag = f.pr === "none" ? "no PR" : `${f.pr} PR`
	if (f.activeWithinCutoff) return { action: "keep", reason: `${tag}, active within ${days}d` }
	return { action: "prune", reason: `${tag}, clean, pushed, idle >${days}d` }
}

/** Any mtime under dir newer than cutoff? Early-exit; hitting the walk cap
 * counts as active (keep) — never prune on incomplete evidence. */
export function isActiveSince(dir: string, cutoffMs: number): boolean {
	const stack = [dir]
	let seen = 0
	while (stack.length) {
		const d = stack.pop()!
		let names: string[]
		try {
			if (statSync(d).mtimeMs > cutoffMs) return true
			names = readdirSync(d)
		} catch {
			continue
		}
		for (const n of names) {
			if (++seen > WALK_CAP) return true
			const p = join(d, n)
			try {
				const st = statSync(p, { throwIfNoEntry: false })
				if (!st) continue
				if (st.mtimeMs > cutoffMs) return true
				if (st.isDirectory() && !st.isSymbolicLink()) stack.push(p)
			} catch {}
		}
	}
	return false
}

interface ExecOut {
	code: number
	stdout: string
	stderr: string
}

async function arc(args: string[], cwd: string): Promise<ExecOut> {
	const p = Bun.spawn(["arc", ...args], { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
	const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
	return { code, stdout, stderr }
}

function protectedPaths(): Set<string> {
	const set = new Set<string>()
	try {
		const cfg = JSON.parse(readFileSync(join(homedir(), ".arc-git", "config.json"), "utf8"))
		for (const p of cfg.protectedMounts ?? []) set.add(p)
	} catch {}
	return set
}

/** Drop a pruned path from arc-wt's registry so its remount service does
 * not resurrect the worktree with a fresh empty store. */
export function dropArcWtEntry(statePath: string, mountPath: string): boolean {
	try {
		const state = JSON.parse(readFileSync(statePath, "utf8"))
		const before = state.entries?.length ?? 0
		state.entries = (state.entries ?? []).filter((e: { path?: string }) => e.path !== mountPath)
		if (state.entries.length === before) return false
		writeFileSync(statePath, JSON.stringify(state, null, 1) + "\n")
		return true
	} catch {
		return false
	}
}

async function gatherFacts(
	entry: MountEntry,
	prot: Set<string>,
	opts: { minIdleDays: number; openPrIdleDays: number },
): Promise<MountFacts & { detail: string }> {
	const primaryStore = join(homedir(), ".arc", "store")
	if (entry.store === primaryStore || prot.has(entry.path))
		return { isProtected: true, detached: false, dirty: false, unpushed: false, pr: "none", activeWithinCutoff: true, detail: "" }

	const st = await arc(["status", "--json", "-u", "all"], entry.path)
	let dirty = false
	try {
		const parsed = JSON.parse(st.stdout)
		dirty = Object.values(parsed.status ?? {}).some((a) => Array.isArray(a) && a.length > 0)
	} catch {
		// unreadable status → treat as dirty (never prune on incomplete evidence)
		dirty = true
	}

	const infoRes = await arc(["info", "--json"], entry.path)
	let branch: string | undefined
	let remote: string | undefined
	try {
		const info = JSON.parse(infoRes.stdout)
		branch = info.branch
		remote = info.remote
	} catch {}
	const detached = !branch || branch.startsWith("(")

	let unpushed = false
	if (!detached) {
		// upstream recorded → local-only commits vs it; never pushed → any
		// commits the branch has over trunk are local-only
		const range = remote ? `arcadia/${remote}..HEAD` : "trunk..HEAD"
		const lg = await arc(["log", "--format={commit}", range], entry.path)
		if (lg.code !== 0) unpushed = true
		else unpushed = lg.stdout.split("\n").filter(Boolean).length > 0
	}

	let pr: PrState = "none"
	const prRes = await arc(["pr", "status", "--json"], entry.path)
	if (prRes.code === 0) {
		try {
			const status = String(JSON.parse(prRes.stdout).status ?? "")
			// unknown future statuses count as open — the conservative tier
			pr = status === "merged" ? "merged" : status === "discarded" ? "discarded" : "open"
		} catch {}
	}

	const days = pr === "open" ? opts.openPrIdleDays : opts.minIdleDays
	const activeWithinCutoff = isActiveSince(entry.store, Date.now() - days * DAY_MS)
	return { isProtected: false, detached, dirty, unpushed, pr, activeWithinCutoff, detail: branch ?? "" }
}

export async function pruneMounts(rest: string[]): Promise<never> {
	const apply = rest.includes("--apply")
	const num = (flag: string, dflt: number): number => {
		const i = rest.indexOf(flag)
		const v = i === -1 ? NaN : parseInt(rest[i + 1] ?? "")
		return Number.isFinite(v) ? v : dflt
	}
	const opts = { minIdleDays: num("--min-idle", 14), openPrIdleDays: num("--open-pr-idle", 180) }

	const inv = await arc(["unmount", "--list"], homedir())
	if (inv.code !== 0) {
		process.stderr.write(inv.stderr)
		process.exit(inv.code)
	}
	const entries = parseInventory(inv.stdout)
	const prot = protectedPaths()
	const arcWtState = join(homedir(), ".arc", "arc-wt", "state.json")
	let pruned = 0

	for (const entry of entries) {
		if (!entry.mounted) {
			const hint = existsSync(entry.path)
				? "dir exists — remountable; inspect with: arc mount " + entry.path
				: "dir missing — `git worktree prune` will forget it"
			console.log(`REPORT [unmounted] ${entry.path} (${hint})`)
			continue
		}
		const facts = await gatherFacts(entry, prot, opts)
		const verdict = decide(facts, opts)
		const branch = facts.detail ? ` [${facts.detail}]` : ""
		if (verdict.action === "keep") {
			console.log(`KEEP  ${entry.path}${branch} (${verdict.reason})`)
			continue
		}
		if (!apply) {
			console.log(`PRUNE ${entry.path}${branch} (${verdict.reason}) — dry-run, use --apply`)
			pruned++
			continue
		}
		// plain unmount first: its busy refusal is the exact in-use detector
		const u = await arc(["unmount", entry.path], "/")
		if (u.code !== 0) {
			const holders = u.stderr.split("\n").slice(1, 4).join(" ").trim()
			console.log(`KEEP  ${entry.path}${branch} (busy: ${holders || "unmount refused"})`)
			continue
		}
		const f = await arc(["unmount", "--forget", entry.path], "/")
		if (f.code !== 0) {
			process.stderr.write(f.stderr)
			console.log(`ERROR ${entry.path}${branch} (unmounted but not forgotten)`)
			continue
		}
		const dropped = dropArcWtEntry(arcWtState, entry.path)
		console.log(`PRUNE ${entry.path}${branch} (${verdict.reason})${dropped ? " [arc-wt entry dropped]" : ""}`)
		pruned++
	}

	console.log(apply ? `pruned ${pruned} mount(s)` : `${pruned} mount(s) would be pruned (dry-run; use --apply)`)
	process.exit(0)
}
