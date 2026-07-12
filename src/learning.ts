// Main-side learning trigger: negative cache → learn lock → spawn the
// source-run learner → re-exec the freshly installed binary.
// Lock semantics (rebuild-design ticket): known commands never come here; a
// second UNKNOWN command blocks on the lock (≤10 min) and then re-execs the
// fresh binary — if the concurrent learn covered this very command it now
// succeeds with zero extra LLM calls.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { SHIM_HOME } from "./ctx"

const LOCK_DIR = join(SHIM_HOME, "learn.lock")
const STATE = join(SHIM_HOME, "state.json")
const BIN_GIT = join(SHIM_HOME, "bin", "git")
const NEG_CACHE_MS = 60 * 60_000
const LOCK_WAIT_MS = 10 * 60_000

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

const recordFailure = (key: string): void => {
	mkdirSync(SHIM_HOME, { recursive: true })
	const s = readState()
	s[key] = Date.now()
	writeFileSync(STATE, JSON.stringify(s, null, "\t") + "\n")
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
	if (!existsSync(BIN_GIT))
		fatal(`fatal: arc-git: learned, but ${BIN_GIT} is missing — run \`bun run install-shim\` in the shim repo`, 128)
	const env: Record<string, string> = { ...process.env } as Record<string, string>
	if (guard) env.ARC_GIT_REEXEC = "1"
	const p = Bun.spawn([BIN_GIT, ...argv], { stdio: ["inherit", "inherit", "inherit"], env })
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

	let srcDir: string | undefined
	try {
		srcDir = JSON.parse(readFileSync(join(SHIM_HOME, "config.json"), "utf8")).srcDir
	} catch {}
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
		const payload = JSON.stringify({ argv: cmd, callCwd, arcRoot, mode: "live" })
		const p = Bun.spawn(["bun", join(srcDir!, "src", "learner.ts"), "--json", payload], {
			cwd: srcDir,
			stdio: ["ignore", "ignore", "inherit"], // learner phase lines land on our stderr
			env: { ...process.env, ARC_GIT: "off" } as Record<string, string>,
		})
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
