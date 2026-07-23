import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decide, dropArcWtEntry, isActiveSince, parseInventory } from "../src/prune-mounts"
import type { MountFacts } from "../src/prune-mounts"

const OPTS = { minIdleDays: 14, openPrIdleDays: 180 }
const base: MountFacts = {
	isProtected: false,
	detached: false,
	dirty: false,
	unpushed: false,
	pr: "none",
	activeWithinCutoff: false,
}

describe("parseInventory", () => {
	test("mounted and unmounted lines", () => {
		const out =
			"[unmounted] mount: /u/old store: /s/old object_store: /o \n" +
			"[mounted, pid: 57290] mount: /u/arcadia store: /s/a object_store: /o\n" +
			"garbage line\n"
		expect(parseInventory(out)).toEqual([
			{ mounted: false, path: "/u/old", store: "/s/old" },
			{ mounted: true, path: "/u/arcadia", store: "/s/a" },
		])
	})

	test("paths with spaces survive (greedy up to ' store: ')", () => {
		const out = "[mounted, pid: 1] mount: /u/my worktree store: /s/x object_store: /o\n"
		expect(parseInventory(out)).toEqual([{ mounted: true, path: "/u/my worktree", store: "/s/x" }])
	})
})

describe("decide", () => {
	test("protected always kept", () => {
		expect(decide({ ...base, isProtected: true, dirty: true }, OPTS).action).toBe("keep")
	})
	test("dirty always kept, even with merged PR", () => {
		const v = decide({ ...base, dirty: true, pr: "merged" }, OPTS)
		expect(v).toEqual({ action: "keep", reason: "dirty tree" })
	})
	test("unpushed always kept", () => {
		expect(decide({ ...base, unpushed: true, pr: "merged" }, OPTS).reason).toBe("unpushed commits")
	})
	test("detached kept for manual review", () => {
		expect(decide({ ...base, detached: true }, OPTS).action).toBe("keep")
	})
	test("merged PR + clean + pushed + idle → prune", () => {
		expect(decide({ ...base, pr: "merged" }, OPTS)).toEqual({
			action: "prune",
			reason: "merged PR, clean, pushed, idle >14d",
		})
	})
	test("discarded PR behaves like merged", () => {
		expect(decide({ ...base, pr: "discarded" }, OPTS).action).toBe("prune")
	})
	test("open PR idle beyond 180d → prune", () => {
		expect(decide({ ...base, pr: "open" }, OPTS)).toEqual({
			action: "prune",
			reason: "open PR, clean, pushed, idle >180d",
		})
	})
	test("open PR active within 180d → keep", () => {
		const v = decide({ ...base, pr: "open", activeWithinCutoff: true }, OPTS)
		expect(v).toEqual({ action: "keep", reason: "open PR, active within 180d" })
	})
	test("no PR, recently active → keep", () => {
		expect(decide({ ...base, activeWithinCutoff: true }, OPTS).reason).toBe("no PR, active within 14d")
	})
	test("no PR, idle → prune", () => {
		expect(decide(base, OPTS).action).toBe("prune")
	})
})

describe("isActiveSince", () => {
	test("fresh file → active; backdated tree → idle", () => {
		const dir = mkdtempSync(join(tmpdir(), "arcgit-prune-"))
		const f = join(dir, "x.txt")
		writeFileSync(f, "hi")
		expect(isActiveSince(dir, Date.now() - 60_000)).toBe(true)
		const old = new Date(Date.now() - 30 * 24 * 60 * 60_000)
		utimesSync(f, old, old)
		utimesSync(dir, old, old)
		expect(isActiveSince(dir, Date.now() - 60_000)).toBe(false)
	})
})

describe("dropArcWtEntry", () => {
	test("removes matching entry, keeps others, reports miss", () => {
		const dir = mkdtempSync(join(tmpdir(), "arcgit-wt-"))
		const state = join(dir, "state.json")
		writeFileSync(
			state,
			JSON.stringify({
				entries: [
					{ name: "a", path: "/wt/a", store_path: "/s/a" },
					{ name: "b", path: "/wt/b", store_path: "/s/b" },
				],
			}),
		)
		expect(dropArcWtEntry(state, "/wt/a")).toBe(true)
		const after = JSON.parse(readFileSync(state, "utf8"))
		expect(after.entries.map((e: { name: string }) => e.name)).toEqual(["b"])
		expect(dropArcWtEntry(state, "/wt/zzz")).toBe(false)
		expect(dropArcWtEntry(join(dir, "missing.json"), "/wt/a")).toBe(false)
	})
})
