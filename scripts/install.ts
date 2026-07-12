// Build + install pipeline — the SAME gate and swap the learner uses (both
// import src/build.ts): gen → typecheck → bun test → compile → SELF-TEST THE
// COMPILED ARTIFACT → atomic swap into ~/.arc-git/bin/git.
// Prints the PATH line to add; never edits shell config itself.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BIN_DIR, gateSteps, INSTALLED_GIT, installBinary } from "../src/build"
import { SHIM_HOME } from "../src/ctx"

const ROOT = join(import.meta.dir, "..")

for (const [label, cmd] of gateSteps(ROOT)) {
	console.log(`>> ${label}`)
	const p = Bun.spawn(cmd, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] })
	if ((await p.exited) !== 0) {
		console.error(`install: ${label} failed — binary untouched`)
		process.exit(1)
	}
}

installBinary(ROOT)

// merge, don't clobber: config.json may carry user keys (e.g. defaultModel)
let config: Record<string, unknown> = {}
try {
	config = JSON.parse(readFileSync(join(SHIM_HOME, "config.json"), "utf8"))
} catch {}
writeFileSync(
	join(SHIM_HOME, "config.json"),
	JSON.stringify({ ...config, srcDir: ROOT, installedAt: new Date().toISOString() }, null, "\t") + "\n",
)

console.log(`\ninstalled: ${INSTALLED_GIT}`)
console.log(`rollback:  git arc-shim rollback   (restores git.prev)`)
console.log(`\nadd to PATH (fish):  fish_add_path --move ${BIN_DIR}`)
console.log(`disable:             remove that PATH entry, or ARC_GIT=off for one command`)
