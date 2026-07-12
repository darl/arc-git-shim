// Generic fixture harness: runs a path's embedded fixtures against a canned-arc
// Ctx. This is the whole per-path test story: pi writes fixtures, this executes
// them — both under `bun test` and inside the compiled binary (selftest).
import { compileSpec, parseSpec } from "./core"
import type { Ctx, ExecResult, Fixture, Path } from "./core"

const FIXTURE_ROOT = "/arcadia"

export interface FixtureResult {
	path: string
	fixture: string
	pass: boolean
	detail: string
	arcCalls: string[]
}

export function cannedCtx(fx: Fixture, calls: string[]): Ctx {
	return {
		cwd: fx.cwd ?? FIXTURE_ROOT,
		arcRoot: FIXTURE_ROOT,
		config: new Map(Object.entries(fx.config ?? {})),
		async arc(args) {
			const key = args.join(" ")
			calls.push(`arc ${key}`)
			const r = fx.arcReplies[key]
			if (!r) return { stdout: "", stderr: `canned-arc: no reply scripted for: arc ${key}\n`, code: 250 }
			return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: r.code ?? 0 }
		},
	}
}

export async function runFixture(path: Path, fx: Fixture): Promise<FixtureResult> {
	const calls: string[] = []
	const args = parseSpec(compileSpec(path.spec), fx.argv)
	if (!args || (path.refine && !path.refine(args)))
		return { path: path.name, fixture: fx.name, pass: false, detail: "fixture argv does not match own spec", arcCalls: [] }
	let got: ExecResult
	try {
		got = await path.run(args, cannedCtx(fx, calls))
	} catch (e) {
		return { path: path.name, fixture: fx.name, pass: false, detail: `threw: ${e}`, arcCalls: calls }
	}
	const bad: string[] = []
	if (fx.want.stdout !== undefined && got.stdout !== fx.want.stdout)
		bad.push(`stdout ${JSON.stringify(got.stdout)} != ${JSON.stringify(fx.want.stdout)}`)
	if (fx.want.stderr !== undefined && got.stderr !== fx.want.stderr)
		bad.push(`stderr ${JSON.stringify(got.stderr)} != ${JSON.stringify(fx.want.stderr)}`)
	if (got.code !== fx.want.code) bad.push(`exit ${got.code} != ${fx.want.code}`)
	return { path: path.name, fixture: fx.name, pass: bad.length === 0, detail: bad.join("; ") || "ok", arcCalls: calls }
}

export async function runAll(paths: Path[]): Promise<FixtureResult[]> {
	const out: FixtureResult[] = []
	for (const p of paths) for (const fx of p.fixtures) out.push(await runFixture(p, fx))
	return out
}
