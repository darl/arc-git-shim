// rev-parse --abbrev-ref HEAD      → current branch name
// rev-parse --abbrev-ref HEAD@{u}  → upstream as an EXPLICIT full remote ref:
// arcadia/users/<login>/<branch> — the asymmetric ref lens never abbreviates
// what it reports (arc info's "remote" field lacks the remote prefix; add it).
import { arcInfo, definePath, fail, isDetached, isExecResult, ok } from "../core"

const UPSTREAM = new Set(["HEAD@{u}", "@{u}", "HEAD@{upstream}", "@{upstream}"])

export default definePath({
	name: "rev-parse-abbrev-ref",
	summary: "branch name for HEAD, explicit arcadia/... ref for HEAD@{u}",
	spec: "rev-parse --abbrev-ref <ref>",
	refine: (args) => args.pos.ref === "HEAD" || UPSTREAM.has(args.pos.ref!),

	async run(args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		// detached: arc omits the branch field or reports a bare 40-hex hash;
		// git prints "HEAD" for --abbrev-ref
		const branch = isDetached(info.branch) ? "HEAD" : info.branch!
		if (args.pos.ref === "HEAD") return ok(`${branch}\n`)
		if (!info.remote) return fail(128, `fatal: no upstream configured for branch '${branch}'\n`)
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
		{
			name: "detached HEAD prints HEAD, not the hash",
			argv: ["rev-parse", "--abbrev-ref", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}' },
			},
			want: { stdout: "HEAD\n", code: 0 },
		},
		{
			name: "@{upstream} long spelling accepted",
			argv: ["rev-parse", "--abbrev-ref", "@{upstream}"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","remote":"users/darl/feature-x"}' },
			},
			want: { stdout: "arcadia/users/darl/feature-x\n", code: 0 },
		},
	],
})
