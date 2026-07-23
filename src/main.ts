// arc-git entry point: a binary named `git`.
//   outside an arc tree  → exec the real git, transparently
//   inside an arc tree   → dispatch to a translation path
//   unknown shape        → learning trigger (fatal until the loop is wired)
import { existsSync, renameSync } from "node:fs"
import { INSTALLED_GIT, PREV_GIT } from "./build"
import { checkCollisions, dispatch, stripGlobalFlags } from "./core"
import type { ExecResult } from "./core"
import { detectTree, loadConfigStore, makeCtx, persistCtx } from "./ctx"
import { execRealGit, findRealGit } from "./gitexec"
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

// git pages these subcommands when stdout is a TTY; the shim mirrors that
// (acceptance finding: `git log` must open $PAGER like real git does)
const PAGED = new Set(["log", "diff", "show", "branch"])

// Real git subcommands. An unknown FIRST token (a typo, or a partial like
// "br" leaked by shell tab-completion helpers) gets git's own instant error —
// learning is only for unknown SHAPES of real commands, never for
// non-commands (acceptance finding: a stray <tab> froze the shell on a
// learn episode for `git br`).
// prettier-ignore
const GIT_SUBCOMMANDS = new Set([
	"add", "am", "annotate", "apply", "archive", "bisect", "blame", "branch", "bundle",
	"cat-file", "check-attr", "check-ignore", "check-mailmap", "check-ref-format",
	"checkout", "cherry", "cherry-pick", "clean", "clone", "commit", "commit-graph",
	"commit-tree", "config", "count-objects", "credential", "describe", "diff",
	"diff-files", "diff-index", "diff-tree", "difftool", "fast-export", "fast-import",
	"fetch", "filter-branch", "for-each-ref", "format-patch", "fsck", "gc", "grep",
	"hash-object", "help", "init", "log", "ls-files", "ls-remote", "ls-tree",
	"maintenance", "merge", "merge-base", "merge-file", "merge-tree", "mergetool",
	"mktag", "mktree", "mv", "name-rev", "notes", "pack-refs", "pull", "push",
	"range-diff", "read-tree", "rebase", "reflog", "remote", "repack", "replace",
	"rerere", "reset", "restore", "rev-list", "rev-parse", "revert", "rm", "send-email",
	"shortlog", "show", "show-branch", "show-ref", "sparse-checkout", "stash", "status",
	"stripspace", "submodule", "switch", "symbolic-ref", "tag", "unpack-file",
	"update-index", "update-ref", "var", "verify-commit", "verify-pack", "verify-tag",
	"whatchanged", "worktree", "write-tree",
])

async function emit(res: ExecResult, paged: boolean): Promise<never> {
	if (res.stdout) {
		const pager = process.env.GIT_PAGER ?? process.env.PAGER ?? "less"
		if (paged && res.code === 0 && process.stdout.isTTY && pager && pager !== "cat") {
			// LESS=FRX like git: quit if it fits one screen, raw colors, no init
			const p = Bun.spawn(["/bin/sh", "-c", pager], {
				stdin: "pipe",
				stdout: "inherit",
				stderr: "inherit",
				env: { ...process.env, LESS: process.env.LESS ?? "FRX" } as Record<string, string>,
			})
			try {
				p.stdin.write(res.stdout)
				await p.stdin.end()
			} catch {} // pager quit early (q) — not an error
			await p.exited
		} else process.stdout.write(res.stdout)
	}
	if (res.stderr) process.stderr.write(res.stderr)
	process.exit(res.code)
}

/** Value of alias.<name>: the shim-local config store first (set via
 * `git config` inside the arc tree), then the user's real git config. */
async function aliasValue(name: string, cwd: string, arcRoot: string): Promise<string | null> {
	const local = loadConfigStore(arcRoot).get(`alias.${name}`)
	if (local !== undefined) return local
	const git = findRealGit()
	if (!git) return null
	const p = Bun.spawn([git, "config", "--get", `alias.${name}`], {
		cwd,
		stdout: "pipe",
		stderr: "ignore",
		stdin: "ignore",
	})
	const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited])
	const v = out.trim()
	return code === 0 && v ? v : null
}

/** git-style alias-value split: whitespace, honoring '…' and "…" quoting. */
function splitAlias(value: string): string[] {
	const out: string[] = []
	let cur = ""
	let quote: string | null = null
	let started = false
	for (const ch of value) {
		if (quote) {
			if (ch === quote) quote = null
			else cur += ch
		} else if (ch === "'" || ch === '"') {
			quote = ch
			started = true
		} else if (ch === " " || ch === "\t") {
			if (started || cur) out.push(cur)
			cur = ""
			started = false
		} else cur += ch
	}
	if (started || cur) out.push(cur)
	return out
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
		if (sub === "prune-mounts") await (await import("./prune-mounts")).pruneMounts(argv.slice(2))
		if (sub === "paths") {
			for (const p of paths) console.log(`${p.name.padEnd(32)} ${p.spec}`)
			process.exit(0)
		}
		if (sub === "version") {
			console.log(`arc-git ${VERSION}`)
			process.exit(0)
		}
		console.error(
			"arc-git builtins: selftest | rollback | paths | version | learn [--model p/m] -- <git args> | prune-mounts [--apply] [--min-idle d] [--open-pr-idle d]",
		)
		process.exit(sub ? 1 : 0)
	}

	// layer-1 kill-switch: behave as a pure alias of real git
	if (process.env.ARC_GIT === "off") await execRealGit(argv)

	const [cmd, effCwd, noPager] = stripGlobalFlags(argv, process.cwd())

	// bare `git`, `git --version`, `git --help`, … → real git handles these
	if (cmd.length === 0 || cmd[0]!.startsWith("-")) await execRealGit(argv)

	const tree = detectTree(effCwd)
	if (!tree || tree.kind === "git") await execRealGit(argv)

	let effCmd = cmd
	let d = dispatch(paths, effCmd)

	// alias expansion, git semantics: aliases never shadow real subcommands,
	// and an unknown first token checks alias.<name> before erroring
	// (acceptance finding: `git br` must resolve the user's br=branch alias)
	for (let depth = 0; d.kind === "unknown" && !GIT_SUBCOMMANDS.has(effCmd[0]!) && depth < 10; depth++) {
		const value = await aliasValue(effCmd[0]!, effCwd, tree!.root)
		if (value === null) {
			// byte-shaped like real git; exit 1 like real git
			process.stderr.write(`git: '${effCmd[0]}' is not a git command. See 'git --help'.\n`)
			process.exit(1)
		}
		if (value.startsWith("!")) {
			// shell alias: sh at the tree root with args appended, GIT_PREFIX
			// pointing back at the invocation subdir (git semantics)
			const prefix = effCwd === tree!.root ? "" : effCwd.startsWith(tree!.root + "/") ? effCwd.slice(tree!.root.length + 1) + "/" : ""
			const p = Bun.spawn(["/bin/sh", "-c", `${value.slice(1)} "$@"`, value.slice(1), ...effCmd.slice(1)], {
				cwd: tree!.root,
				stdio: ["inherit", "inherit", "inherit"],
				env: { ...process.env, GIT_PREFIX: prefix } as Record<string, string>,
			})
			process.exit(await p.exited)
		}
		effCmd = [...splitAlias(value), ...effCmd.slice(1)]
		d = dispatch(paths, effCmd)
	}

	if (d.kind === "ambiguous") {
		process.stderr.write(`fatal: arc-git: internal dispatch ambiguity: ${d.names.join(" vs ")}\n`)
		process.exit(128)
	}
	if (d.kind === "unknown") {
		if (process.env.ARC_GIT === "static") {
			// no-learn mode: shell completion helpers and other unattended
			// callers must never block on a learn episode
			process.stderr.write(`fatal: arc-git: no translation for '${effCmd.join(" ")}' (learning disabled: ARC_GIT=static)\n`)
			process.exit(1)
		}
		await triggerLearning(effCmd, argv, effCwd, tree!.root)
		process.exit(1) // unreachable — triggerLearning never returns
	}

	const { ctx, configSnapshot } = makeCtx(effCwd, tree!.root, noPager)
	const res = await d.path.run(d.args, ctx)
	persistCtx(ctx, configSnapshot)
	await emit(res, !noPager && PAGED.has(effCmd[0]!))
}

await main()
