// Shared build pipeline: the gate step list and the atomic binary swap.
// ONE definition used by both scripts/install.ts and the learner — the gate
// is the system's safety contract, so a step added here protects both entry
// points; drift between them is exactly the failure this module prevents.
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs"
import { join } from "node:path"
import { SHIM_HOME } from "./ctx"

export const BIN_DIR = join(SHIM_HOME, "bin")
export const INSTALLED_GIT = join(BIN_DIR, "git")
export const PREV_GIT = join(BIN_DIR, "git.prev")

/** gen → typecheck → tests → compile → self-test the COMPILED artifact.
 * Commands are relative to the shim source root (run them with cwd=root). */
export const gateSteps = (root: string): [label: string, cmd: string[]][] => [
	["codegen + collision gate", ["bun", "scripts/gen.ts"]],
	["typecheck", ["bun", "x", "tsc", "--noEmit"]],
	["tests", ["bun", "test"]],
	["compile", ["bun", "build", "--compile", "--minify", "src/main.ts", "--outfile", "dist/git"]],
	["compiled-artifact selftest", [join(root, "dist", "git"), "--arc-git-selftest"]],
]

/** Atomic swap of <root>/dist/git into ~/.arc-git/bin/git (previous binary
 * kept as git.prev for `git arc-shim rollback`). */
export function installBinary(root: string): void {
	mkdirSync(BIN_DIR, { recursive: true })
	const fresh = join(BIN_DIR, "git.new")
	copyFileSync(join(root, "dist", "git"), fresh)
	chmodSync(fresh, 0o755)
	if (existsSync(INSTALLED_GIT)) renameSync(INSTALLED_GIT, PREV_GIT)
	renameSync(fresh, INSTALLED_GIT) // atomic on same fs; running old inode unaffected
}
