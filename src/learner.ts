// The learning episode driver. Runs FROM SOURCE (`bun src/learner.ts`) —
// never compiled into the shim binary (rebuild-design decision: the 68 MB /
// ~100 ms pi tax stays off the hot path).
//
// Spawned by the shim on an unknown command (live mode) or by
// `git arc-shim learn -- <argv>` (hand mode). Contract (learning-loop
// design ticket): pi writes exactly ONE new path file; gate = gen →
// typecheck → bun test → compile → compiled selftest; ≤5 repair iterations,
// ≤8 min wall; green → atomic swap (+ auto-commit in live mode, message
// `learn: <spec>`); the whole episode is logged to ~/.arc-git/logs/.
//
// This process runs with ARC_GIT=off (set below) so every `git` its
// subprocesses touch — including pi's bash tool and the auto-commit — hits
// real git, never the shim.
import { appendFileSync, copyFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { SHIM_HOME } from "./ctx"

process.env.ARC_GIT = "off"

interface Payload {
	argv: string[] // the git command (after global-flag stripping)
	callCwd: string // where it was invoked (inside the arc tree)
	arcRoot: string
	mode: "live" | "hand"
	model?: string // "provider/id" effort dial (hand mode)
}

const SRC = join(import.meta.dir, "..")
const BIN = join(SHIM_HOME, "bin")
const MAX_ITERATIONS = 5
const MAX_WALL_MS = 8 * 60_000

const payload: Payload = JSON.parse(process.argv[process.argv.indexOf("--json") + 1]!)
const hand = payload.mode === "hand"
const started = Date.now()

mkdirSync(join(SHIM_HOME, "logs"), { recursive: true })
const logFile = join(SHIM_HOME, "logs", `learn-${new Date().toISOString().replace(/[:.]/g, "-")}.log`)
const log = (s: string) => appendFileSync(logFile, s.endsWith("\n") ? s : s + "\n")
const phase = (s: string) => {
	process.stderr.write(`arc-git: ${s}\n`)
	log(`== ${s}`)
}

const run = async (cmd: string[], cwd = SRC): Promise<{ code: number; out: string }> => {
	const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: process.env as Record<string, string> })
	const [so, se, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
	return { code, out: so + se }
}

async function gate(): Promise<{ green: boolean; report: string }> {
	const steps: [string, string[]][] = [
		["codegen+collisions", ["bun", "scripts/gen.ts"]],
		["typecheck", ["bun", "x", "tsc", "--noEmit"]],
		["tests", ["bun", "test"]],
		["compile", ["bun", "build", "--compile", "--minify", "src/main.ts", "--outfile", "dist/git"]],
		["compiled selftest", [join(SRC, "dist", "git"), "--arc-git-selftest"]],
	]
	for (const [label, cmd] of steps) {
		const r = await run(cmd)
		log(`-- gate ${label}: exit ${r.code}\n${r.out}`)
		if (r.code !== 0) {
			const tail = r.out.split("\n").slice(-60).join("\n")
			return { green: false, report: `Gate step "${label}" failed (exit ${r.code}):\n${tail}` }
		}
	}
	return { green: true, report: "" }
}

function swap(): void {
	mkdirSync(BIN, { recursive: true })
	const target = join(BIN, "git")
	const fresh = join(BIN, "git.new")
	copyFileSync(join(SRC, "dist", "git"), fresh)
	chmodSync(fresh, 0o755)
	if (existsSync(target)) renameSync(target, join(BIN, "git.prev"))
	renameSync(fresh, target)
}

const listPaths = () => new Set(readdirSync(join(SRC, "src", "paths")).filter((f) => f.endsWith(".ts")))

function specOf(file: string): string | null {
	const m = readFileSync(join(SRC, "src", "paths", file), "utf8").match(/spec:\s*"([^"]+)"/)
	return m ? m[1]! : null
}

async function buildPrompt(): Promise<string> {
	const { paths } = await import("./paths-index")
	const sub = payload.argv[0]
	const nearMiss = paths
		.filter((p) => p.spec.split(" ")[0] === sub)
		.map((p) => `  - ${p.name}: spec "${p.spec}"`)
		.join("\n")
	const example1 = readFileSync(join(SRC, "src", "paths", "branch-show-current.ts"), "utf8")
	const example2 = readFileSync(join(SRC, "src", "paths", "rev-list-count.ts"), "utf8")
	const grammar = readFileSync(join(SRC, "src", "core.ts"), "utf8").split("// ------")[0]

	return `You are the learning half of arc-git: a binary that impersonates \`git\` inside Yandex Arcadia (arc VCS) working copies by translating git commands to arc commands and emulating git's output formats.

A git invocation just arrived that NO existing translation path matches:

    git ${payload.argv.join(" ")}

It was invoked in the arc working copy at: ${payload.callCwd}
(arc root: ${payload.arcRoot})

## Your job

Write EXACTLY ONE new file in src/paths/ (kebab-case name describing the command shape) that teaches the shim this command, using definePath. Do NOT edit src/core.ts, src/paths-index.ts, src/main.ts, or any existing path file — the registry is regenerated automatically and a build gate (typecheck + all fixtures + collision check) must pass with your file added.

## The path interface and spec grammar (from src/core.ts)

${grammar}

## Existing paths for the same subcommand (your spec must not collide — a stricter/more-specific spec wins; equal specificity on the same argv is a build error)

${nearMiss || "  (none)"}

## Two example path files

--- src/paths/branch-show-current.ts ---
${example1}
--- src/paths/rev-list-count.ts ---
${example2}

## Cross-cutting contracts you must respect

- The only remote is "arcadia" ("origin" silently accepted as an input alias).
- Ref lens is asymmetric: users/<login>/ is injected implicitly on PUSH only (guard against double prefixes); stdout always reports full explicit refs; pull/fetch never inject.
- If the command genuinely has no arc equivalent, a path that returns a git-style "fatal: ... is not supported in an arc repository" (exit 128) is a VALID and permanent answer.
- Match = parse is strict: declare ONLY the argv shapes you actually handle; undeclared shapes must keep falling through to future learning.
- Output formats must be byte-shaped like real git when the output is machine-parseable (porcelain, plumbing); prose commands may pass arc output through.

## Grounding rules

- You MAY run READ-ONLY arc commands (status, log, info, show, diff, branch, --help of anything) in the calling tree at ${payload.callCwd} via bash (cd there first) to capture REAL output shapes for your fixtures. NEVER run mutating commands (add/commit/checkout/push/reset/clean/...) outside this repository.
- \`arc <subcommand> --help\` tells you what arc supports. arc log/branch/status support --json — prefer structured output over parsing prose.
- Note: arc's log --format uses {placeholder} syntax; git's %X placeholders do NOT work in arc.
- Fixtures are MANDATORY (they double as dispatch-collision probes). Canned arc replies are keyed by the arc argv joined with spaces (no "arc " prefix).
- You may run \`bun test\` and \`bun scripts/gen.ts\` here yourself to check your work before finishing.

When you are done, reply with a one-line summary naming the file you created. I will then run the full gate and report any failures back to you for repair.`
}

async function main(): Promise<void> {
	phase(`unknown command 'git ${payload.argv.join(" ")}', learning… (log: ${logFile})`)
	const before = listPaths()

	const { AuthStorage, ModelRegistry, DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir } =
		await import("@earendil-works/pi-coding-agent")

	const authStorage = AuthStorage.create()
	const modelRegistry = ModelRegistry.create(authStorage)
	const [prov, id] = (payload.model ?? "darl-glm/glm-5.2").split("/") as [string, string]
	const model = modelRegistry.find(prov, id)
	if (!model) {
		phase(`learning failed: model ${prov}/${id} not available`)
		process.exit(1)
	}

	const loader = new DefaultResourceLoader({
		cwd: SRC,
		agentDir: getAgentDir(),
		systemPromptOverride: () =>
			"You are a careful TypeScript engineer embedded in the arc-git shim. You write one self-contained translation-path file at a time, ground output formats in real command probes, and never touch shared code.",
		appendSystemPromptOverride: () => [],
	})
	await loader.reload()

	const { session } = await createAgentSession({
		cwd: SRC,
		model,
		tools: ["read", "grep", "find", "ls", "edit", "write", "bash"],
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(SRC),
		authStorage,
		modelRegistry,
	})

	session.subscribe((e: any) => {
		try {
			const t = e?.type ?? ""
			if (hand) {
				if (t === "tool_execution_start") process.stderr.write(`  [pi] ${e.toolName ?? "tool"} ${JSON.stringify(e.args ?? {}).slice(0, 160)}\n`)
				else if (t === "message_final" && e.message?.role === "assistant") {
					const txt = (e.message.content ?? []).map((c: any) => c.text ?? "").join("")
					if (txt.trim()) process.stderr.write(`  [pi] ${txt.trim().split("\n")[0]}\n`)
				}
			}
			if (t === "tool_execution_start") log(`[pi tool] ${e.toolName} ${JSON.stringify(e.args ?? {})}`)
		} catch {}
	})

	let message = await buildPrompt()
	let green = false
	for (let i = 1; i <= MAX_ITERATIONS; i++) {
		if (Date.now() - started > MAX_WALL_MS) {
			phase(`learning failed: 8 min wall clock exhausted`)
			process.exit(1)
		}
		log(`>> prompt (iteration ${i}):\n${message}`)
		await session.prompt(message)
		const g = await gate()
		if (g.green) {
			green = true
			break
		}
		phase(`attempt ${i}/${MAX_ITERATIONS}: gate red`)
		message = `${g.report}\n\nFix the problem. Remember: edit ONLY your new path file under src/paths/ (or delete and recreate it); never edit shared code or other paths.`
	}
	session.dispose()

	if (!green) {
		phase(`learning failed after ${MAX_ITERATIONS} attempts (log: ${logFile})`)
		process.exit(1)
	}

	const created = [...listPaths()].filter((f) => !before.has(f))
	const spec = created.length === 1 ? specOf(created[0]!) : null
	phase(`gate green (${created.join(", ") || "existing paths modified"}) — installing`)
	swap()

	// negative cache cleared by any successful rebuild (failure-contract design)
	try {
		writeFileSync(join(SHIM_HOME, "state.json"), "{}\n")
	} catch {}

	if (!hand) {
		const msg = `learn: ${spec ?? payload.argv.join(" ")}\n\nTriggered by: git ${payload.argv.join(" ")}\nEpisode log: ${logFile}\n`
		await run(["git", "add", "src/paths", "src/paths-index.ts"])
		const c = await run(["git", "commit", "-m", msg])
		log(`-- auto-commit: exit ${c.code}\n${c.out}`)
		if (c.code !== 0) phase("warning: auto-commit failed (see log); learned path is installed but uncommitted")
	} else {
		phase(`review mode: ${created.join(", ")} left uncommitted in ${SRC}`)
	}
	phase("rebuilt and installed")
	process.exit(0)
}

await main()
