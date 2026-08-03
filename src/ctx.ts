// Production Ctx: real arc subprocess + persistent shim-local config store.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { ArcOpts, Ctx, ExecResult } from "./core"

export const SHIM_HOME = process.env.ARC_GIT_HOME ?? join(homedir(), ".arc-git")

const storeFile = (arcRoot: string): string =>
	join(SHIM_HOME, "store", createHash("sha256").update(arcRoot).digest("hex").slice(0, 16) + ".json")

export function loadConfigStore(arcRoot: string): Map<string, string> {
	try {
		return new Map(Object.entries(JSON.parse(readFileSync(storeFile(arcRoot), "utf8"))))
	} catch {
		return new Map()
	}
}

export function saveConfigStore(arcRoot: string, config: Map<string, string>): void {
	const f = storeFile(arcRoot)
	mkdirSync(join(SHIM_HOME, "store"), { recursive: true })
	writeFileSync(f, JSON.stringify(Object.fromEntries(config), null, "\t") + "\n")
}

export async function runArc(
	args: string[],
	cwd: string,
	tty?: { interactive?: boolean; noPager?: boolean },
): Promise<ExecResult> {
	if (tty?.interactive && process.stdout.isTTY) {
		// unbounded prose passthrough: arc streams to the terminal and pages
		// itself (buffering bare `arc log` = the whole trunk history)
		const env: Record<string, string> = { ...process.env, ARC_NO_AUTO_UPDATE: "1" } as Record<string, string>
		if (tty.noPager) env.PAGER = "cat" // git --no-pager: stream, don't page
		const proc = Bun.spawn(["arc", ...args], { cwd, stdio: ["inherit", "inherit", "inherit"], env })
		return { stdout: "", stderr: "", code: await proc.exited }
	}
	const proc = Bun.spawn(["arc", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		env: { ...process.env, ARC_NO_AUTO_UPDATE: "1" },
	})
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	return { stdout, stderr, code }
}

export function makeCtx(cwd: string, arcRoot: string, noPager = false): { ctx: Ctx; configSnapshot: string } {
	const config = loadConfigStore(arcRoot)
	const configSnapshot = JSON.stringify([...config.entries()].sort())
	const ctx: Ctx = {
		cwd,
		arcRoot,
		config,
		arc: (args: string[], opts?: ArcOpts) => runArc(args, opts?.cwd ?? cwd, { interactive: opts?.interactive, noPager }),
		pathExists: existsSync,
	}
	return { ctx, configSnapshot }
}

export function persistCtx(ctx: Ctx, configSnapshot: string): void {
	const now = JSON.stringify([...ctx.config.entries()].sort())
	if (now !== configSnapshot) saveConfigStore(ctx.arcRoot, ctx.config)
}

/** Walk up from dir; return {kind:"git"|"arc", root} for the CLOSEST marker,
 * or null when neither exists. Closest-wins: the shim's own plain-git source
 * repo resolves to git even on a machine where $HOME is under some arc tree.
 * The arc marker requires .arc/HEAD: a working copy's .arc symlinks into a
 * git-dir-shaped store, while ~/.arc — arc's CONFIG home, present in $HOME on
 * every arc machine — has no HEAD (acceptance finding: a `git clone` under
 * $HOME was mistaken for an in-arc-tree call and refused). */
export function detectTree(dir: string): { kind: "git" | "arc"; root: string } | null {
	let d = dir
	for (;;) {
		if (existsSync(join(d, ".git"))) return { kind: "git", root: d }
		if (existsSync(join(d, ".arc", "HEAD"))) return { kind: "arc", root: d }
		const parent = dirname(d)
		if (parent === d) return null
		d = parent
	}
}
