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
import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gateSteps, installBinary } from "./build"
import { SHIM_HOME } from "./ctx"
import { clearNegativeCache, type LearnPayload, recordFailure, releaseLearnLockIfOwner } from "./learning"

process.env.ARC_GIT = "off"

const SRC = join(import.meta.dir, "..")
const MAX_ITERATIONS = 5
const MAX_WALL_MS = 8 * 60_000

const payload: LearnPayload = JSON.parse(process.argv[process.argv.indexOf("--json") + 1]!)
const hand = payload.mode === "hand"
const started = Date.now()

// live mode runs detached (own process group): the spawning shim may die
// mid-episode (t3code kills git's whole group on its 30s timeout) and this
// process finishes alone. Two consequences handled here:
//  - stderr is inherited from that possibly-dead shim; a broken pipe must
//    not crash a surviving learner (the log file is the reliable channel)
//  - the learn lock now carries THIS pid, and the shim's finally-unlock is
//    gone with the shim — release it ourselves on every exit path
process.stderr.on("error", () => {})
process.on("exit", () => releaseLearnLockIfOwner(process.pid))

/** Failure exit: live mode writes the negative cache itself — a dead shim
 * can't, and without the entry every retry burns another doomed episode. */
const dieLearning = (msg: string): never => {
	phase(msg)
	if (!hand) recordFailure(payload.argv.join(" "))
	process.exit(1)
}

// the wall-clock check below runs only BETWEEN iterations — a stalled pi call
// inside one iteration would otherwise keep this process (and the learn lock)
// alive indefinitely (acceptance finding: an orphaned learner survived ^C)
setTimeout(() => {
	dieLearning("learning failed: hard wall-clock limit")
}, MAX_WALL_MS * 1.25)

mkdirSync(join(SHIM_HOME, "logs"), { recursive: true })
const logFile = join(SHIM_HOME, "logs", `learn-${new Date().toISOString().replace(/[:.]/g, "-")}.log`)
const log = (s: string) => appendFileSync(logFile, s.endsWith("\n") ? s : s + "\n")
const phase = (s: string) => {
	try {
		process.stderr.write(`arc-git: ${s}\n`)
	} catch {} // stderr pipe may be gone with the shim — log() is the record
	log(`== ${s}`)
}

const run = async (cmd: string[], cwd = SRC): Promise<{ code: number; out: string }> => {
	const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: process.env as Record<string, string> })
	const [so, se, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
	return { code, out: so + se }
}

async function gate(): Promise<{ green: boolean; report: string }> {
	for (const [label, cmd] of gateSteps(SRC)) {
		const r = await run(cmd)
		log(`-- gate ${label}: exit ${r.code}\n${r.out}`)
		if (r.code !== 0) {
			const tail = r.out.split("\n").slice(-60).join("\n")
			return { green: false, report: `Gate step "${label}" failed (exit ${r.code}):\n${tail}` }
		}
	}
	return { green: true, report: "" }
}

const listPaths = () => new Set(readdirSync(join(SRC, "src", "paths")).filter((f) => f.endsWith(".ts")))

/** Spec of a freshly gated path file — via the module system, not source
 * scraping (the gate just proved the file compiles). */
async function specOf(file: string): Promise<string | null> {
	try {
		return (await import(join(SRC, "src", "paths", file))).default.spec ?? null
	} catch {
		return null
	}
}

async function buildPrompt(): Promise<string> {
	const { paths } = await import("./paths-index")
	const sub = payload.argv[0]
	const family = paths.filter((p) => p.spec.split(" ")[0] === sub)
	const nearMiss = family.map((p) => `  - ${p.name}: spec "${p.spec}"`).join("\n")
	// Same-subcommand files double as examples: they show which shared helpers
	// the family already imports — the antidote to pi reinventing them (the
	// for-each-ref glob engine was copied verbatim into four sibling files
	// before it was consolidated into src/refs.ts).
	const pathsDir = join(SRC, "src", "paths")
	const wanted = new Set(family.map((p) => p.name))
	const familyExamples: string[] = []
	for (const f of readdirSync(pathsDir)) {
		if (familyExamples.length >= 2) break
		const src = readFileSync(join(pathsDir, f), "utf8")
		if ([...wanted].some((n) => src.includes(`name: "${n}"`))) familyExamples.push(`--- src/paths/${f} ---\n${src}`)
	}
	const example1 = readFileSync(join(pathsDir, "branch-show-current.ts"), "utf8")
	const example2 = readFileSync(join(pathsDir, "rev-list-count.ts"), "utf8")
	const coreSrc = readFileSync(join(SRC, "src", "core.ts"), "utf8")
	const grammar = coreSrc.split("// ------")[0]
	const helpers = coreSrc.slice(
		coreSrc.indexOf("// ------------------------------------------------------- shared arc helpers"),
	)

	return `You are the learning half of arc-git: a binary that impersonates \`git\` inside Yandex Arcadia (arc VCS) working copies by translating git commands to arc commands and emulating git's output formats.

A git invocation just arrived that NO existing translation path matches:

    git ${payload.argv.join(" ")}

It was invoked in the arc working copy at: ${payload.callCwd}
(arc root: ${payload.arcRoot})

## Your job

Write EXACTLY ONE new file in src/paths/ (kebab-case name describing the command shape) that teaches the shim this command, using definePath. Do NOT edit src/core.ts, src/paths-index.ts, src/main.ts, or any existing path file — the registry is regenerated automatically and a build gate (typecheck + all fixtures + collision check) must pass with your file added.

## The path interface and spec grammar (from src/core.ts)

${grammar}

## Shared helpers — REUSE these, never reimplement them inline

From src/core.ts (import from "../core"):

${helpers}

Family engines also exist — read them before writing family-shaped logic:
- src/refs.ts: arc branch --json listing (BranchEntry/listBranches), git ref glob matching, %(...) format rendering — the for-each-ref / branch family
- src/gitlog.ts: git %-placeholder log rendering from arc log --json, format:/tformat: newline policy — the log family

A path file that re-implements one of these is a defect even if it passes the gate.

## Existing paths for the same subcommand (your spec must not collide — a stricter/more-specific spec wins; equal specificity on the same argv is a build error)

${nearMiss || "  (none)"}

## Two example path files

--- src/paths/branch-show-current.ts ---
${example1}
--- src/paths/rev-list-count.ts ---
${example2}
${familyExamples.length ? `\n## Path files from the same subcommand family (imitate their imports and shared-helper use)\n\n${familyExamples.join("\n")}` : ""}

## Cross-cutting contracts you must respect

- The only remote is "arcadia" ("origin" silently accepted as an input alias).
- Ref lens is asymmetric: users/<login>/ is injected implicitly on PUSH only (guard against double prefixes); stdout always reports full explicit refs; pull/fetch never inject.
- If the command genuinely has no arc equivalent, a path that returns a git-style "fatal: ... is not supported in an arc repository" (exit 128) is a VALID and permanent answer.
- FIRST verify the argv shape is real git: run \`ARC_GIT=off git <argv…>\` in any real git repo (this shim checkout works). If native git REJECTS the shape ("unknown option", "unknown subcommand", usage + exit 129), the correct path REJECTS it with git's exact stderr and exit code — NEVER invent a friendly interpretation for invalid git syntax; that teaches callers fake git.
- Match = parse is strict: declare ONLY the argv shapes you actually handle; undeclared shapes must keep falling through to future learning.
- Output formats must be byte-shaped like real git when the output is machine-parseable (porcelain, plumbing); prose commands may pass arc output through.

## Grounding rules

- You MAY run READ-ONLY arc commands (status, log, info, show, diff, branch, --help of anything) in the calling tree at ${payload.callCwd} via bash (cd there first) to capture REAL output shapes for your fixtures. NEVER run mutating commands (add/commit/checkout/push/reset/clean/...) outside this repository.
- \`arc <subcommand> --help\` tells you what arc supports. arc log/branch/status support --json — prefer structured output over parsing prose.
- Note: arc's log --format uses {placeholder} syntax; git's %X placeholders do NOT work in arc.
- Fixtures are MANDATORY (they double as dispatch-collision probes). Canned arc replies are keyed by the arc argv joined with spaces (no "arc " prefix).
- PRIVACY — this repository is public on GitHub and your file is auto-committed. Nothing you saw in the calling tree may appear in your file: no real directory or file paths, branch names, commit subjects, PR/revision numbers, or the cwd/root paths above — not in the spec, not in fixture argv, not in canned replies, not in comments. Probe the real tree only to learn output FORMATS, then write fixtures with synthetic values of the same byte shape (paths like dir/sub/file.txt, branches like users/darl/feature-x, invented 40-hex hashes, made-up commit subjects and numbers).
- You may run \`bun test\` and \`bun scripts/gen.ts\` here yourself to check your work before finishing.

When you are done, reply with a one-line summary naming the file you created. I will then run the full gate and report any failures back to you for repair.`
}

/** Public-safe rendering of the triggering argv. Auto-commits are pushed to
 * the public shim repo, and operands are real content from the calling tree
 * (paths, branch names, message text) — keep the subcommand and flag shape,
 * count the rest. The episode log keeps the full argv locally. */
const publicArgv = (argv: string[]): string => {
	const parts: string[] = []
	let operands = 0
	for (const [i, a] of argv.entries()) {
		if (i === 0 || a === "--" || a.startsWith("-")) parts.push(a.replace(/^(--?[^=]+)=.+$/, "$1=…"))
		else operands++
	}
	if (operands > 0) parts.push(`<${operands} operand${operands === 1 ? "" : "s"}>`)
	return parts.join(" ")
}

async function main(): Promise<void> {
	phase(`unknown command 'git ${payload.argv.join(" ")}', learning… (log: ${logFile})`)
	const before = listPaths()

	const { AuthStorage, ModelRegistry, DefaultResourceLoader, SessionManager, createAgentSession, getAgentDir } =
		await import("@earendil-works/pi-coding-agent")

	const authStorage = AuthStorage.create()
	const modelRegistry = ModelRegistry.create(authStorage)
	let configModel: string | undefined
	try {
		configModel = JSON.parse(readFileSync(join(SHIM_HOME, "config.json"), "utf8")).defaultModel
	} catch {}
	const [prov, id] = (payload.model ?? configModel ?? "darl-glm/glm-5.2").split("/") as [string, string]
	const model = modelRegistry.find(prov, id)
	if (!model) dieLearning(`learning failed: model ${prov}/${id} not available`)

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
			if (t === "tool_execution_start") {
				log(`[pi tool] ${e.toolName} ${JSON.stringify(e.args ?? {})}`)
				if (hand) process.stderr.write(`  [pi] ${e.toolName ?? "tool"} ${JSON.stringify(e.args ?? {}).slice(0, 160)}\n`)
			} else if (hand && t === "message_final" && e.message?.role === "assistant") {
				const txt = (e.message.content ?? []).map((c: any) => c.text ?? "").join("")
				if (txt.trim()) process.stderr.write(`  [pi] ${txt.trim().split("\n")[0]}\n`)
			}
		} catch {}
	})

	let message = await buildPrompt()
	let green = false
	for (let i = 1; i <= MAX_ITERATIONS; i++) {
		if (Date.now() - started > MAX_WALL_MS) dieLearning(`learning failed: 8 min wall clock exhausted`)
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

	if (!green) dieLearning(`learning failed after ${MAX_ITERATIONS} attempts (log: ${logFile})`)

	const created = [...listPaths()].filter((f) => !before.has(f))
	const spec = created.length === 1 ? await specOf(created[0]!) : null
	phase(`gate green (${created.join(", ") || "existing paths modified"}) — installing`)
	installBinary(SRC)
	clearNegativeCache() // any successful rebuild clears failure memory

	if (!hand) {
		const msg = `learn: ${spec ?? publicArgv(payload.argv)}\n\nTriggered by: git ${publicArgv(payload.argv)}\nEpisode log: ${logFile}\n`
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
