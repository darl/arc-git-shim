// arc-git entry point: a binary named `git`.
//   outside an arc tree  → exec the real git, transparently
//   inside an arc tree   → dispatch to a translation path
//   unknown shape        → learning trigger (fatal until the loop is wired)
import { existsSync, renameSync } from "node:fs"
import { join } from "node:path"
import { dispatch, stripGlobalFlags } from "./core"
import { detectTree, makeCtx, persistCtx, SHIM_HOME } from "./ctx"
import { execRealGit } from "./gitexec"
import { checkCollisions } from "./core"
import { runAll } from "./harness"
import { paths } from "./paths-index"

const VERSION = "0.1.0"

async function selftest(): Promise<never> {
	const collisions = checkCollisions(paths)
	const results = await runAll(paths)
	let failed = collisions.length
	for (const c of collisions) console.error(`FAIL collision: ${c}`)
	for (const r of results) {
		if (r.pass) continue
		failed++
		console.error(`FAIL ${r.path}/${r.fixture}: ${r.detail}`)
		for (const c of r.arcCalls) console.error(`     ${c}`)
	}
	console.error(`arc-git selftest: ${results.length - (failed - collisions.length)}/${results.length} fixtures ok, ${collisions.length} collisions`)
	process.exit(failed ? 1 : 0)
}

function rollback(): never {
	const cur = join(SHIM_HOME, "bin", "git")
	const prev = join(SHIM_HOME, "bin", "git.prev")
	if (!existsSync(prev)) {
		console.error(`arc-git: nothing to roll back (${prev} missing)`)
		process.exit(1)
	}
	renameSync(prev, cur)
	console.error("arc-git: rolled back to previous binary")
	process.exit(0)
}

async function main(): Promise<void> {
	const argv = Bun.argv.slice(2)

	// layer-1 kill-switch: behave as a pure alias of real git
	if (process.env.ARC_GIT === "off") await execRealGit(argv)

	// shim builtins (never git commands)
	if (argv[0] === "--arc-git-selftest") await selftest()
	if (argv[0] === "arc-shim") {
		const sub = argv[1]
		if (sub === "selftest") await selftest()
		if (sub === "rollback") rollback()
		if (sub === "paths") {
			for (const p of paths) console.log(`${p.name.padEnd(32)} ${p.spec}`)
			process.exit(0)
		}
		if (sub === "version") {
			console.log(`arc-git ${VERSION}`)
			process.exit(0)
		}
		console.error("arc-git builtins: selftest | rollback | paths | version")
		process.exit(sub ? 1 : 0)
	}

	const [cmd, effCwd] = stripGlobalFlags(argv, process.cwd())

	// bare `git`, `git --version`, `git --help`, … → real git handles these
	if (cmd.length === 0 || cmd[0]!.startsWith("-")) await execRealGit(argv)

	const tree = detectTree(effCwd)
	if (!tree || tree.kind === "git") await execRealGit(argv)

	const { ctx, configSnapshot } = makeCtx(effCwd, tree!.root)
	const d = dispatch(paths, cmd)

	if (d.kind === "ambiguous") {
		process.stderr.write(`fatal: arc-git: internal dispatch ambiguity: ${d.names.join(" vs ")}\n`)
		process.exit(128)
	}
	if (d.kind === "unknown") {
		// learning trigger — the pi loop lands in the next ticket; until then
		// this is the honest-fatal contract shape
		process.stderr.write(`fatal: arc-git: no translation for '${cmd.join(" ")}' (learning not wired yet)\n`)
		process.exit(1)
	}

	const res = await d.path.run(d.args, ctx)
	persistCtx(ctx, configSnapshot)
	if (res.stdout) process.stdout.write(res.stdout)
	if (res.stderr) process.stderr.write(res.stderr)
	process.exit(res.code)
}

await main()
