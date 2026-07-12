// arc-git entry point: a binary named `git`.
//   outside an arc tree  → exec the real git, transparently
//   inside an arc tree   → dispatch to a translation path
//   unknown shape        → learning trigger (fatal until the loop is wired)
import { existsSync, renameSync } from "node:fs"
import { INSTALLED_GIT, PREV_GIT } from "./build"
import { checkCollisions, dispatch, stripGlobalFlags } from "./core"
import { detectTree, makeCtx, persistCtx } from "./ctx"
import { execRealGit } from "./gitexec"
import { runAll } from "./harness"
import { readSrcDir, spawnLearner, triggerLearning } from "./learning"
import { paths } from "./paths-index"

const VERSION = "0.1.0"

async function selftest(): Promise<never> {
	const collisions = checkCollisions(paths)
	const results = await runAll(paths)
	let fixtureFails = 0
	for (const c of collisions) console.error(`FAIL collision: ${c}`)
	for (const r of results) {
		if (r.pass) continue
		fixtureFails++
		console.error(`FAIL ${r.path}/${r.fixture}: ${r.detail}`)
		for (const c of r.arcCalls) console.error(`     ${c}`)
	}
	console.error(`arc-git selftest: ${results.length - fixtureFails}/${results.length} fixtures ok, ${collisions.length} collisions`)
	process.exit(fixtureFails || collisions.length ? 1 : 0)
}

/** Hand-run seed generation: `git arc-shim learn [--model p/m] -- <git args>`.
 * Same episode as a live learn, but: full pi stream, NO auto-commit (review
 * mode), no negative cache. Run it inside a real arc tree. */
async function handLearn(rest: string[]): Promise<never> {
	let model: string | undefined
	const sep = rest.indexOf("--")
	const pre = sep === -1 ? rest : rest.slice(0, sep)
	const cmd = sep === -1 ? [] : rest.slice(sep + 1)
	const mi = pre.indexOf("--model")
	if (mi !== -1) model = pre[mi + 1]
	if (!cmd.length) {
		console.error("usage: git arc-shim learn [--model provider/model] -- <git args>")
		process.exit(2)
	}
	const tree = detectTree(process.cwd())
	if (!tree || tree.kind !== "arc") {
		console.error("arc-git: run hand learns inside an arc tree (probing needs one)")
		process.exit(1)
	}
	const srcDir = readSrcDir()
	if (!srcDir) {
		console.error("arc-git: ~/.arc-git/config.json missing — run `bun run install-shim` first")
		process.exit(1)
	}
	const p = spawnLearner(
		srcDir,
		{ argv: cmd, callCwd: process.cwd(), arcRoot: tree.root, mode: "hand", model },
		["inherit", "inherit", "inherit"],
	)
	process.exit(await p.exited)
}

function rollback(): never {
	if (!existsSync(PREV_GIT)) {
		console.error(`arc-git: nothing to roll back (${PREV_GIT} missing)`)
		process.exit(1)
	}
	renameSync(PREV_GIT, INSTALLED_GIT)
	console.error("arc-git: rolled back to previous binary")
	process.exit(0)
}

async function main(): Promise<void> {
	const argv = Bun.argv.slice(2)

	// shim builtins first — they are never git commands, so the kill-switch
	// must not divert them (the learner runs its gate with ARC_GIT=off, and
	// the compiled selftest has to work in that environment)
	if (argv[0] === "--arc-git-selftest") await selftest()
	if (argv[0] === "arc-shim") {
		const sub = argv[1]
		if (sub === "selftest") await selftest()
		if (sub === "rollback") rollback()
		if (sub === "learn") await handLearn(argv.slice(2))
		if (sub === "paths") {
			for (const p of paths) console.log(`${p.name.padEnd(32)} ${p.spec}`)
			process.exit(0)
		}
		if (sub === "version") {
			console.log(`arc-git ${VERSION}`)
			process.exit(0)
		}
		console.error("arc-git builtins: selftest | rollback | paths | version | learn [--model p/m] -- <git args>")
		process.exit(sub ? 1 : 0)
	}

	// layer-1 kill-switch: behave as a pure alias of real git
	if (process.env.ARC_GIT === "off") await execRealGit(argv)

	const [cmd, effCwd] = stripGlobalFlags(argv, process.cwd())

	// bare `git`, `git --version`, `git --help`, … → real git handles these
	if (cmd.length === 0 || cmd[0]!.startsWith("-")) await execRealGit(argv)

	const tree = detectTree(effCwd)
	if (!tree || tree.kind === "git") await execRealGit(argv)

	const d = dispatch(paths, cmd)

	if (d.kind === "ambiguous") {
		process.stderr.write(`fatal: arc-git: internal dispatch ambiguity: ${d.names.join(" vs ")}\n`)
		process.exit(128)
	}
	if (d.kind === "unknown") {
		await triggerLearning(cmd, argv, effCwd, tree!.root)
		process.exit(1) // unreachable — triggerLearning never returns
	}

	const { ctx, configSnapshot } = makeCtx(effCwd, tree!.root)
	const res = await d.path.run(d.args, ctx)
	persistCtx(ctx, configSnapshot)
	if (res.stdout) process.stdout.write(res.stdout)
	if (res.stderr) process.stderr.write(res.stderr)
	process.exit(res.code)
}

await main()
