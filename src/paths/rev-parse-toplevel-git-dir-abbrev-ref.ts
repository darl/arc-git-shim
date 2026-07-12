// git rev-parse --show-toplevel --absolute-git-dir --abbrev-ref HEAD
// Prints one line per requested value, in argument order:
//   1. working-tree root (absolute)   → ctx.arcRoot
//   2. .git directory (absolute)       → ctx.arcRoot/.arc  (--absolute-git-dir
//      is always absolute, unlike --git-dir which may be relative)
//   3. abbreviated ref of HEAD         → branch name, or "HEAD" when detached
//      (git rev-parse --abbrev-ref HEAD prints "HEAD" on detached HEAD)
import { arcInfo, definePath, isDetached, isExecResult, ok } from "../core"

export default definePath({
	name: "rev-parse-toplevel-git-dir-abbrev-ref",
	summary: "toplevel + absolute-git-dir + abbrev-ref HEAD three-line combo",
	spec: "rev-parse --show-toplevel --absolute-git-dir --abbrev-ref <ref>",
	refine: (args) => args.pos.ref === "HEAD",

	async run(_args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		const branch = isDetached(info.branch) ? "HEAD" : info.branch ?? "HEAD"
		return ok(`${ctx.arcRoot}\n${ctx.arcRoot}/.arc\n${branch}\n`)
	},

	fixtures: [
		{
			name: "on a branch",
			argv: ["rev-parse", "--show-toplevel", "--absolute-git-dir", "--abbrev-ref", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"pr-12345678","user_login":"darl"}' },
			},
			want: { stdout: "/arcadia\n/arcadia/.arc\npr-12345678\n", code: 0 },
		},
		{
			name: "detached HEAD prints HEAD for abbrev-ref",
			argv: ["rev-parse", "--show-toplevel", "--absolute-git-dir", "--abbrev-ref", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}' },
			},
			want: { stdout: "/arcadia\n/arcadia/.arc\nHEAD\n", code: 0 },
		},
	],
})
