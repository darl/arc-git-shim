// orca: symbolic-ref --quiet --short HEAD → branch name, or exit 1 when
// detached (quiet). Without --short git prints refs/heads/<name>.
import { arcInfo, definePath, fail, isDetached, isExecResult, ok } from "../core"

export default definePath({
	name: "symbolic-ref-head",
	summary: "current branch via symbolic-ref semantics (detached → exit 1)",
	spec: "symbolic-ref (--quiet|-q)? --short? <ref>",
	refine: (args) => args.pos.ref === "HEAD",

	async run(args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		const b = info.branch ?? ""
		if (isDetached(b)) {
			if (args.flags.has("--quiet") || args.flags.has("-q")) return fail(1, "")
			return fail(128, "fatal: ref HEAD is not a symbolic ref\n")
		}
		return ok(args.flags.has("--short") ? `${b}\n` : `refs/heads/${b}\n`)
	},

	fixtures: [
		{
			name: "short branch name",
			argv: ["symbolic-ref", "--quiet", "--short", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x"}' },
			},
			want: { stdout: "feature-x\n", code: 0 },
		},
		{
			name: "full ref without --short",
			argv: ["symbolic-ref", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x"}' },
			},
			want: { stdout: "refs/heads/feature-x\n", code: 0 },
		},
		{
			name: "detached quiet exit 1",
			argv: ["symbolic-ref", "--quiet", "--short", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0"}' },
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
	],
})
