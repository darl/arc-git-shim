// Real-git resolution + exec. Recursion armor (rebuild-design contract):
//   layer 1: ARC_GIT=off → callers opt out of shim logic entirely (main.ts)
//   layer 2: PATH scan skips anything under SHIM_HOME and anything that is
//            this very binary (realpath comparison)
//   layer 3: ARC_GIT_ACTIVE depth guard — if resolution still lands on
//            ourselves while the guard is up, fatal instead of forkbombing
import { existsSync, realpathSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { SHIM_HOME } from "./ctx"

const safeReal = (p: string): string => {
	try {
		return realpathSync(p)
	} catch {
		return p
	}
}

export function findRealGit(): string | null {
	const self = safeReal(process.execPath)
	const shimHome = safeReal(SHIM_HOME)
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue
		const cand = join(dir, "git")
		if (!existsSync(cand)) continue // cheap check first: most PATH dirs have no git
		const rdir = safeReal(dir)
		if (rdir === shimHome || rdir.startsWith(shimHome + "/")) continue
		try {
			if (!(statSync(cand).mode & 0o111)) continue
		} catch {
			continue
		}
		const rcand = safeReal(cand)
		if (rcand === self) continue
		return cand
	}
	return null
}

export async function execRealGit(argv: string[]): Promise<never> {
	const git = findRealGit()
	if (!git) {
		process.stderr.write("fatal: arc-git: no real git found on PATH (excluding the shim)\n")
		process.exit(128)
	}
	if (process.env.ARC_GIT_ACTIVE === "1" && safeReal(git) === safeReal(process.execPath)) {
		process.stderr.write("fatal: arc-git: recursion guard tripped — real-git resolution found the shim itself\n")
		process.exit(128)
	}
	const proc = Bun.spawn([git, ...argv], {
		stdio: ["inherit", "inherit", "inherit"],
		env: { ...process.env, ARC_GIT_ACTIVE: "1" },
	})
	process.exit(await proc.exited)
}
