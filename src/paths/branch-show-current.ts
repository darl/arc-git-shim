// arc has no `branch --show-current`; arc info --json carries the branch.
// Used in command substitution by agents — stdout must be exact.
import { arcInfo, definePath, isDetached, isExecResult, ok } from "../core"

export default definePath({
	name: "branch-show-current",
	summary: "current branch name from arc info --json",
	spec: "branch --show-current",

	async run(_args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		// detached HEAD: git prints nothing, exit 0
		return ok(isDetached(info.branch) ? "" : `${info.branch}\n`)
	},

	fixtures: [
		{
			name: "on a branch",
			argv: ["branch", "--show-current"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"pr-12345678","user_login":"darl"}' },
			},
			want: { stdout: "pr-12345678\n", code: 0 },
		},
		{
			name: "detached HEAD prints nothing",
			argv: ["branch", "--show-current"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0"}' },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
