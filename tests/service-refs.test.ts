import { expect, test } from "bun:test"
import { compileSpec, parseSpec } from "../src/core"
import { cannedCtx } from "../src/harness"
import remove from "../src/paths/update-ref-private-delete"
import { persistentRefs } from "../src/ctx"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import fetch from "../src/paths/fetch"
import verify from "../src/paths/rev-parse-verify"
const sha = "a".repeat(40)
test("fetch pins the remote branch under a private review ref", async () => {
	const ctx = cannedCtx({ name: "pin", argv: [], arcReplies: {
		"fetch trunk": {}, "rev-parse arcadia/trunk": { stdout: sha + "\n" },
	}, want: { code: 0 } }, [])
	const ref = "refs/t3/review-guide/one/base"
	const result = await fetch.run(parseSpec(compileSpec(fetch.spec), ["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/trunk:${ref}`])!, ctx)
	expect(result.code).toBe(0)
	expect(ctx.refs.get(ref)).toBe(sha)
	const read = await verify.run(parseSpec(compileSpec(verify.spec), ["rev-parse", "--verify", ref + "^{commit}"])!, ctx)
	expect(read).toEqual({ code: 0, stdout: sha + "\n", stderr: "" })
	ctx.arc = async () => ({ code: 0, stdout: "b".repeat(40) + "\n", stderr: "" })
	expect((await verify.run(parseSpec(compileSpec(verify.spec), ["rev-parse", "--verify", ref])!, ctx)).stdout).toBe(sha + "\n")
	ctx.arc = async () => ({ code: 1, stdout: "", stderr: "network error" })
	expect((await fetch.run(parseSpec(compileSpec(fetch.spec), ["fetch", "origin", `+refs/heads/trunk:${ref}`])!, ctx)).code).toBe(1)
	expect(ctx.refs.get(ref)).toBe(sha)
	ctx.arc = async args => args[0] === "fetch" ? { code: 0, stdout: "", stderr: "" } : { code: 0, stdout: "not-a-hash", stderr: "" }
	expect((await fetch.run(parseSpec(compileSpec(fetch.spec), ["fetch", "origin", `+refs/heads/trunk:${ref}`])!, ctx)).code).toBe(128)
	expect(ctx.refs.get(ref)).toBe(sha)
	await remove.run(parseSpec(compileSpec(remove.spec), ["update-ref", "-d", ref])!, ctx)
	expect((await verify.run(parseSpec(compileSpec(verify.spec), ["rev-parse", "--verify", "--quiet", ref])!, ctx)).code).toBe(1)
})

test("private pins persist separately across contexts and remain isolated by checkout", () => {
	const root = mkdtempSync(join(tmpdir(), "arc-git-private-refs-"))
	const first = persistentRefs(root, root), second = persistentRefs(root, root), other = persistentRefs(root + "/other", root)
	const a = "refs/t3/review-guide/a/base", b = "refs/t3/review-guide/b/base"
	try {
		first.set(a, sha); second.set(b, "b".repeat(40))
		expect(persistentRefs(root, root).get(a)).toBe(sha)
		expect(persistentRefs(root, root).get(b)).toBe("b".repeat(40))
		expect(other.get(a)).toBeUndefined()
		first.delete(a)
		expect(second.get(a)).toBeUndefined()
		expect(second.get(b)).toBe("b".repeat(40))
	} finally { first.delete(a); first.delete(b); rmSync(root, { recursive: true, force: true }) }
})
