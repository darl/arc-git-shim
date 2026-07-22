// git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
//   → abbreviated upstream ref ("arcadia/users/<login>/<branch>").
// When both --abbrev-ref and --symbolic-full-name are given, --abbrev-ref
// wins (git prints the short form).  @{upstream} / @{u} / HEAD@{upstream} /
// HEAD@{u} all resolve to the current branch's upstream tracking ref.
//
// --abbref-ref is a common typo for --abbrev-ref; accept both spellings so
// the shim doesn't fall through to learning for a one-letter misspelling.
import { arcInfo, definePath, fail, isExecResult, ok } from "../core"

const UPSTREAM_REFS = new Set([
	"@{upstream}",
	"@{u}",
	"HEAD@{upstream}",
	"HEAD@{u}",
])

export default definePath({
	name: "rev-parse-abbrev-ref-symbolic-full-name",
	summary: "abbreviated upstream ref via arc info --json",
	spec: "rev-parse (--abbrev-ref|--abbref-ref) --symbolic-full-name <ref>",
	refine: (args) => UPSTREAM_REFS.has(args.pos.ref!),

	async run(_args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		if (!info.remote)
			return fail(128, `fatal: no upstream configured for branch '${info.branch ?? "HEAD"}'\n`)
		return ok(`arcadia/${info.remote}\n`)
	},

	fixtures: [
		{
			name: "upstream long form @{upstream}",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "arcadia/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "typo --abbref-ref accepted",
			argv: ["rev-parse", "--abbref-ref", "--symbolic-full-name", "@{upstream}"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "arcadia/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "short form @{u} with HEAD prefix",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "HEAD@{u}"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"pr-12345678","remote":"users/darl/submit-1234","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "arcadia/users/darl/submit-1234\n", code: 0 },
		},
		{
			name: "no upstream configured",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"local-only","user_login":"darl"}' },
			},
			want: { stdout: "", stderr: "fatal: no upstream configured for branch 'local-only'\n", code: 128 },
		},
	],
})
