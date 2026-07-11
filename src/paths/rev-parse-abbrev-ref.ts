// rev-parse --abbrev-ref HEAD      → current branch name
// rev-parse --abbrev-ref HEAD@{u}  → upstream as an EXPLICIT full remote ref:
// arcadia/users/<login>/<branch> — the asymmetric ref lens never abbreviates
// what it reports (arc info's "remote" field lacks the remote prefix; add it).
import { arcInfo, definePath, fail, isExecResult, ok } from "../core"

export default definePath({
	name: "rev-parse-abbrev-ref",
	summary: "branch name for HEAD, explicit arcadia/... ref for HEAD@{u}",
	spec: "rev-parse --abbrev-ref <ref>",
	refine: (args) => args.pos.ref === "HEAD" || args.pos.ref === "HEAD@{u}" || args.pos.ref === "@{u}",

	async run(args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		if (args.pos.ref === "HEAD") return ok(`${info.branch ?? "HEAD"}\n`)
		if (!info.remote)
			return fail(128, `fatal: no upstream configured for branch '${info.branch ?? "HEAD"}'\n`)
		return ok(`arcadia/${info.remote}\n`)
	},

	fixtures: [
		{
			name: "upstream is full explicit ref",
			argv: ["rev-parse", "--abbrev-ref", "HEAD@{u}"],
			arcReplies: {
				"info --json": {
					stdout: '{"branch":"feature-x","remote":"users/darl/feature-x","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "arcadia/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "HEAD gives branch name",
			argv: ["rev-parse", "--abbrev-ref", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"pr-12345678","user_login":"darl"}' },
			},
			want: { stdout: "pr-12345678\n", code: 0 },
		},
		{
			name: "no upstream configured",
			argv: ["rev-parse", "--abbrev-ref", "HEAD@{u}"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"local-only","user_login":"darl"}' },
			},
			want: { stdout: "", stderr: "fatal: no upstream configured for branch 'local-only'\n", code: 128 },
		},
	],
})
