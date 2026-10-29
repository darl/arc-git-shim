import { expect, test } from "bun:test"
import { compileSpec, fail, ok, parseSpec } from "../src/core"
import { cannedCtx } from "../src/harness"
import worktreeAdd from "../src/paths/worktree-add"

for (const fx of worktreeAdd.fixtures.filter(f => f.name.startsWith("existing local branch transferred"))) {
	test(fx.name + " preserves branch state across isolated mounts", async () => {
		const sha = "a".repeat(40)
		const branch = fx.argv.at(-1)!
		const localBranches = new Map([["trunk", "b".repeat(40)]])
		const tracking = new Map<string, string>()
		let head = "trunk"
		const ctx = cannedCtx(fx, [])
		const cannedArc = ctx.arc
		ctx.arc = async (argv, opts) => {
			if (opts?.cwd !== "/wt/repro") return cannedArc(argv, opts)
			if (argv[0] === "checkout") {
				const ref = argv[1]!
				if (!/^[a-f0-9]{40}$/.test(ref) && !localBranches.has(ref)) return fail(1, "unknown branch\n")
				head = ref
				return ok()
			}
			if (argv[0] === "branch" && argv[1] === "--force") {
				if (head === argv[2]) return fail(1, "cannot reset checked out branch\n")
				localBranches.set(argv[2]!, argv[3]!)
				return ok()
			}
			if (argv[0] === "branch" && argv[1] === "-u") {
				tracking.set(argv[3]!, argv[2]!)
				return ok()
			}
			return fail(250, "unexpected command in new mount\n")
		}
		const result = await worktreeAdd.run(parseSpec(compileSpec(worktreeAdd.spec), fx.argv)!, ctx)
		expect(result.code).toBe(0)
		expect(head).toBe(branch)
		expect(localBranches.get(head)).toBe(sha)
		expect(tracking.get(branch)).toBe(branch === "trunk" ? "trunk" : undefined)
	})
}
