// Main-side learning trigger: negative cache → learn lock → spawn the
// source-run learner → re-exec the freshly installed binary.
// Lock semantics (rebuild-design ticket): known commands never come here; a
// second UNKNOWN command blocks on the lock (≤10 min) and then re-execs the
// fresh binary — if the concurrent learn covered this very command it now
// succeeds with zero extra LLM calls.
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { INSTALLED_GIT } from "./build"
import { SHIM_HOME } from "./ctx"

const LOCK_DIR = join(SHIM_HOME, "learn.lock")
const STATE = join(SHIM_HOME, "state.json")
const NEG_CACHE_MS = 60 * 60_000
const LOCK_WAIT_MS = 10 * 60_000

/** The learner invocation contract, shared by live and hand mode. */
export interface LearnPayload {
	argv: string[] // the git command (after global-flag stripping)
	callCwd: string // where it was invoked (inside the arc tree)
	arcRoot: string
	mode: "live" | "hand"
	model?: string // "provider/id" effort dial (hand mode)
}

/** srcDir of the shim checkout, recorded by scripts/install.ts. */
export const readSrcDir = (): string | undefined => {
	try {
		return JSON.parse(readFileSync(join(SHIM_HOME, "config.json"), "utf8")).srcDir
	} catch {
		return undefined
	}
}

/** Spawn the source-run learner. ARC_GIT=off so every git its subtree
 * touches — pi's bash tool, the gate, the auto-commit — hits real git.
 * detached puts the learner in its own process GROUP: callers like t3code
 * kill git's whole group on their command timeout (Effect spawns children
 * as group leaders and cleans up via kill(-pid)), which would otherwise
 * take the episode down mid-learn. Live mode detaches; hand mode stays
 * attached so ^C still kills the foreground episode. */
export const spawnLearner = (
	srcDir: string,
	payload: LearnPayload,
	stdio: ["inherit" | "ignore", "inherit" | "ignore", "inherit"],
	opts: { detached?: boolean } = {},
): { pid: number | undefined; exited: Promise<number> } => {
	const child = spawn("bun", [join(srcDir, "src", "learner.ts"), "--json", JSON.stringify(payload)], {
		cwd: srcDir,
		stdio,
		detached: opts.detached ?? false,
		env: { ...process.env, ARC_GIT: "off" },
	})
	return {
		pid: child.pid,
		exited: new Promise((resolve) => {
			child.on("error", () => resolve(1))
			child.on("exit", (code) => resolve(code ?? 1))
		}),
	}
}

/** Any successful rebuild clears failure memory (failure-contract design). */
export const clearNegativeCache = (): void => {
	try {
		writeFileSync(STATE, "{}\n")
	} catch {}
}

const fatal = (msg: string, code = 1): never => {
	process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n")
	process.exit(code)
}

const readState = (): Record<string, number> => {
	try {
		return JSON.parse(readFileSync(STATE, "utf8"))
	} catch {
		return {}
	}
}

/** Exported: the learner records its own failures too — when the shim was
 * killed mid-episode (t3code group kill, ^C) nobody else is left to write
 * the negative cache, and without it every retry burns a doomed episode. */
export const recordFailure = (key: string): void => {
	mkdirSync(SHIM_HOME, { recursive: true })
	const s = readState()
	s[key] = Date.now()
	writeFileSync(STATE, JSON.stringify(s, null, "\t") + "\n")
}

/** Learner-side unlock. The shim's own unlock lives in a finally that never
 * runs if the shim dies by signal; a surviving detached learner must release
 * the lock itself or every later unknown command waits out the full 10 min.
 * Pid-guarded so a hand learn can never release a concurrent live lock. */
export const releaseLearnLockIfOwner = (pid: number): void => {
	try {
		if (parseInt(readFileSync(join(LOCK_DIR, "pid"), "utf8")) === pid) rmSync(LOCK_DIR, { recursive: true, force: true })
	} catch {}
}

const tryLock = (): boolean => {
	try {
		mkdirSync(LOCK_DIR)
		writeFileSync(join(LOCK_DIR, "pid"), String(process.pid))
		return true
	} catch {
		// stale-lock steal: holder process gone → remove and retry once
		try {
			const pid = parseInt(readFileSync(join(LOCK_DIR, "pid"), "utf8"))
			process.kill(pid, 0)
		} catch {
			try {
				rmSync(LOCK_DIR, { recursive: true, force: true })
				mkdirSync(LOCK_DIR)
				writeFileSync(join(LOCK_DIR, "pid"), String(process.pid))
				return true
			} catch {}
		}
		return false
	}
}

const unlock = (): void => rmSync(LOCK_DIR, { recursive: true, force: true })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Replace this process (in effect) with the installed shim binary. */
async function reexec(argv: string[], guard: boolean): Promise<never> {
	if (!existsSync(INSTALLED_GIT))
		fatal(`fatal: arc-git: learned, but ${INSTALLED_GIT} is missing — run \`bun run install-shim\` in the shim repo`, 128)
	const env: Record<string, string> = { ...process.env } as Record<string, string>
	if (guard) env.ARC_GIT_REEXEC = "1"
	const p = Bun.spawn([INSTALLED_GIT, ...argv], { stdio: ["inherit", "inherit", "inherit"], env })
	process.exit(await p.exited)
}

export async function triggerLearning(cmd: string[], rawArgv: string[], callCwd: string, arcRoot: string): Promise<never> {
	const key = cmd.join(" ")

	// a re-exec that STILL dispatches unknown means the learned path does not
	// actually match — do not loop into a second episode
	if (process.env.ARC_GIT_REEXEC === "1")
		fatal(`fatal: arc-git: learned a path for '${key}' but it does not match the invocation (see ~/.arc-git/logs)`, 1)

	const failedAt = readState()[key]
	if (failedAt && Date.now() - failedAt < NEG_CACHE_MS) {
		const mins = Math.round((NEG_CACHE_MS - (Date.now() - failedAt)) / 60_000)
		fatal(`fatal: arc-git: no translation for '${key}' (learning failed recently; retries in ~${mins} min)`, 1)
	}

	const srcDir = readSrcDir()
	if (!srcDir || !existsSync(join(srcDir, "src", "learner.ts")))
		fatal(`fatal: arc-git: no translation for '${key}' (learner source not found — is ~/.arc-git/config.json present?)`, 1)

	if (!tryLock()) {
		process.stderr.write(`arc-git: another learn cycle is running; waiting (≤10 min)…\n`)
		const start = Date.now()
		while (existsSync(LOCK_DIR)) {
			if (Date.now() - start > LOCK_WAIT_MS)
				fatal(`fatal: arc-git: no translation for '${key}' (learn lock timeout)`, 1)
			await sleep(500)
		}
		// the finished learn may have covered this very command — fresh binary decides
		await reexec(rawArgv, false)
	}

	try {
		// learner phase lines land on our stderr
		const p = spawnLearner(srcDir!, { argv: cmd, callCwd, arcRoot, mode: "live" }, ["ignore", "ignore", "inherit"], { detached: true })
		// hand the lock to the process that actually owns the episode: if this
		// shim is killed (t3code group kill, orca RPC abort) the stale-steal
		// check must probe the surviving learner, not a dead shim — otherwise
		// a second unknown command steals the lock and races a live learn
		if (p.pid) writeFileSync(join(LOCK_DIR, "pid"), String(p.pid))
		const code = await p.exited
		if (code !== 0) {
			recordFailure(key)
			fatal(`fatal: arc-git: no translation for '${key}' (learning failed, see ~/.arc-git/logs)`, 1)
		}
	} finally {
		unlock()
	}

	process.stderr.write(`arc-git: replaying through the new binary…\n`)
	await reexec(rawArgv, true)
	throw new Error("unreachable")
}
