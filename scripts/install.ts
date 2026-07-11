// Build + install pipeline (same gate the learner will use):
//   gen → typecheck → bun test → compile → SELF-TEST THE COMPILED ARTIFACT →
//   atomic swap into ~/.arc-git/bin/git (previous kept as git.prev)
// Prints the PATH line to add; never edits shell config itself.
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const HOME = process.env.ARC_GIT_HOME ?? join(homedir(), ".arc-git")
const BIN = join(HOME, "bin")

const run = async (cmd: string[], label: string) => {
	console.log(`>> ${label}`)
	const p = Bun.spawn(cmd, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] })
	if ((await p.exited) !== 0) {
		console.error(`install: ${label} failed — binary untouched`)
		process.exit(1)
	}
}

await run(["bun", "scripts/gen.ts"], "codegen + collision gate")
await run(["bun", "x", "tsc", "--noEmit"], "typecheck")
await run(["bun", "test"], "tests")
await run(["bun", "build", "--compile", "--minify", "src/main.ts", "--outfile", "dist/git"], "compile")
await run([join(ROOT, "dist", "git"), "--arc-git-selftest"], "compiled-artifact selftest")

mkdirSync(BIN, { recursive: true })
const target = join(BIN, "git")
const fresh = join(BIN, "git.new")
copyFileSync(join(ROOT, "dist", "git"), fresh)
chmodSync(fresh, 0o755)
if (existsSync(target)) renameSync(target, join(BIN, "git.prev"))
renameSync(fresh, target) // atomic on same fs; running old inode unaffected

writeFileSync(
	join(HOME, "config.json"),
	JSON.stringify({ srcDir: ROOT, installedAt: new Date().toISOString() }, null, "\t") + "\n",
)

console.log(`\ninstalled: ${target}`)
console.log(`rollback:  git arc-shim rollback   (restores git.prev)`)
console.log(`\nadd to PATH (fish):  fish_add_path --move ${BIN}`)
console.log(`disable:             remove that PATH entry, or ARC_GIT=off for one command`)
