import { describe, expect, test } from "bun:test"
import { compileSpec, dispatch, parseSpec, stripGlobalFlags } from "../src/core"
import { paths } from "../src/paths-index"

const parse = (spec: string, argv: string[]) => parseSpec(compileSpec(spec), argv)

describe("spec grammar", () => {
	test("required and optional literal flags", () => {
		expect(parse("rev-list --count --left-right? <range>", ["rev-list", "--count", "a..b"])).toBeTruthy()
		expect(parse("rev-list --count --left-right? <range>", ["rev-list", "a..b"])).toBeNull()
	})

	test("undeclared token → no match (learning trigger)", () => {
		expect(parse("status (-s|--porcelain)", ["status", "--porcelain", "--branch"])).toBeNull()
		expect(parse("log --oneline?", ["log", "--graph"])).toBeNull()
	})

	test("value flag: separate, =-joined, short-attached", () => {
		const spec = "log (--format|--pretty)=<fmt> (-n|--max-count)=<num>? <range>?"
		expect(parse(spec, ["log", "--format=%s", "-n", "5", "a..b"])?.pos).toEqual({
			fmt: "%s",
			num: "5",
			range: "a..b",
		})
		expect(parse(spec, ["log", "--format", "%H %s", "-n5"])?.pos).toEqual({ fmt: "%H %s", num: "5" })
		expect(parse(spec, ["log", "--pretty=format:%s"])?.pos).toEqual({ fmt: "format:%s" })
		// value flag with no value → no match
		expect(parse(spec, ["log", "--format"])).toBeNull()
	})

	test("variadic positionals", () => {
		const spec = "add (-A|--all)? --? <paths...>?"
		expect(parse(spec, ["add", "a.txt", "b.txt"])?.list).toEqual({ paths: ["a.txt", "b.txt"] })
		expect(parse(spec, ["add", "-A"])?.list).toEqual({})
		// required variadic needs at least one
		expect(parse("checkout -- <paths...>", ["checkout", "--"])).toBeNull()
	})

	test("-- separator forces positionals", () => {
		const spec = "checkout (-q|--quiet)? -- <paths...>"
		const got = parse(spec, ["checkout", "--", "-weird-file", "b.txt"])
		expect(got?.list.paths).toEqual(["-weird-file", "b.txt"])
		// undeclared -- → no match
		expect(parse("add <paths...>", ["add", "--", "x"])).toBeNull()
	})

	test("enum sugar", () => {
		const spec = "status --porcelain=v2 --untracked-files=(all|no|normal)?"
		expect(parse(spec, ["status", "--porcelain=v2", "--untracked-files=all"])).toBeTruthy()
		expect(parse(spec, ["status", "--porcelain=v2", "--untracked-files=bogus"])).toBeNull()
	})

	test("specificity: more required literals wins", () => {
		expect(compileSpec("status (-s|--porcelain)").specificity).toBe(2)
		expect(compileSpec("status").specificity).toBe(1)
		expect(compileSpec("log (--format|--pretty)=<fmt> -n=<num>?").specificity).toBe(2)
	})

	test("global flag stripping", () => {
		expect(stripGlobalFlags(["-C", "/x", "status"], "/y")).toEqual([["status"], "/x"])
		expect(stripGlobalFlags(["-c", "core.quotePath=false", "diff"], "/y")).toEqual([["diff"], "/y"])
		expect(stripGlobalFlags(["--no-pager", "log"], "/y")).toEqual([["log"], "/y"])
	})
})

describe("dispatcher against the real path set", () => {
	test("porcelain v2 beats the loose status paths", () => {
		const d = dispatch(paths, ["status", "--porcelain=v2", "--branch", "--untracked-files=all"])
		expect(d.kind).toBe("matched")
		if (d.kind === "matched") expect(d.path.name).toBe("status-porcelain-v2")
	})

	test("unknown git command falls through to learning", () => {
		expect(dispatch(paths, ["bisect", "start"]).kind).toBe("unknown")
		expect(dispatch(paths, ["log", "--graph", "--decorate"]).kind).toBe("unknown")
		expect(dispatch(paths, ["push", "--mirror"]).kind).toBe("unknown")
	})

	test("orca staples all dispatch", () => {
		const staples: [string[], string][] = [
			[["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], "rev-parse-verify"],
			[["worktree", "list", "--porcelain", "-z"], "worktree-list"],
			[["diff", "--name-status", "-M", "-C", "a", "b"], "diff-name-status"],
			[["rev-list", "--left-right", "--count", "a...b"], "rev-list-count"],
			[["for-each-ref", "--format=%(HEAD)%09%(refname:short)", "refs/heads/"], "for-each-ref-heads"],
			[["log", "--format=%s", "-n", "5", "a..b"], "log-format"],
			[["merge-base", "--is-ancestor", "a", "b"], "merge-base-is-ancestor"],
			[["config", "--get", "push.autoSetupRemote"], "config"],
			[["symbolic-ref", "--quiet", "--short", "HEAD"], "symbolic-ref-head"],
			[["show", "--end-of-options", "abc123:some/file.go"], "show-blob"],
		]
		for (const [argv, want] of staples) {
			const d = dispatch(paths, argv)
			expect(d.kind, argv.join(" ")).toBe("matched")
			if (d.kind === "matched") expect(d.path.name, argv.join(" ")).toBe(want)
		}
	})
})
