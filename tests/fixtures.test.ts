// Every path's embedded fixtures, executed through the generic harness —
// the same set the compiled binary replays via `git arc-shim selftest`.
import { describe, expect, test } from "bun:test"
import { checkCollisions } from "../src/core"
import { runFixture } from "../src/harness"
import { paths } from "../src/paths-index"

describe("fixture collisions (codegen gate mirror)", () => {
	test("every fixture dispatches uniquely to its own path", () => {
		expect(checkCollisions(paths)).toEqual([])
	})
})

for (const p of paths) {
	describe(p.name, () => {
		for (const fx of p.fixtures) {
			test(fx.name, async () => {
				const r = await runFixture(p, fx)
				expect(r.detail, r.arcCalls.join(" | ")).toBe("ok")
			})
		}
	})
}
