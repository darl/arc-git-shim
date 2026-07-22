// git branch -m/-M [--] [<old>] <new> → arc branch -m/-M <old> <new>.
// Two-arg form renames <old> → <new>; single-arg form renames the CURRENT
// branch → <new> (current branch resolved from arc info --json).
// The `--` separator is optional (git accepts both `branch -m old new` and
// `branch -m -- old new`); it exists so branch names starting with "-" are
// not mistaken for flags.
//
// A variadic captures 1–2 positionals; refine caps at 2 so shapes like
// `git branch -m a b c` fall through to learning instead of silently
// swallowing extra tokens.
import { arcInfo, definePath, fail, isDetached, isExecResult, ok } from "../core"

export default definePath({
	name: "branch-move",
	summary: "rename branches via arc branch -m/-M",
	spec: "branch (-m|-M) --? <names...>",
	refine: (args) => args.list.names!.length >= 1 && args.list.names!.length <= 2,

	async run(args, ctx) {
		const names = args.list.names!
		let oldName: string
		let newName: string

		if (names.length === 1) {
			// Single-arg form: rename current branch — resolve its arc name.
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			if (isDetached(info.branch)) return fail(128, "fatal: You are not currently on a branch.\n")
			oldName = info.branch!
			newName = names[0]!
		} else {
			oldName = names[0]!
			newName = names[1]!
		}

		const flag = args.flags.has("-M") ? "-M" : "-m"
		const r = await ctx.arc(["branch", flag, oldName, newName])
		return r.code === 0 ? ok() : r
	},

	fixtures: [
		{
			name: "rename with -- separator",
			argv: ["branch", "-m", "--", "t3code/1479713b", "t3code/bootstrap-sim-controller"],
			arcReplies: {
				"branch -m t3code/1479713b t3code/bootstrap-sim-controller": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "rename without -- separator",
			argv: ["branch", "-m", "old-branch", "new-branch"],
			arcReplies: {
				"branch -m old-branch new-branch": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "force rename with -M",
			argv: ["branch", "-M", "old-branch", "new-branch"],
			arcReplies: {
				"branch -M old-branch new-branch": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "rename current branch (single arg)",
			argv: ["branch", "-m", "new-name"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/old-name","user_login":"darl"}' },
				"branch -m users/darl/old-name new-name": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "rename current branch with --",
			argv: ["branch", "-m", "--", "new-name"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/old-name","user_login":"darl"}' },
				"branch -m users/darl/old-name new-name": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "force rename current branch",
			argv: ["branch", "-M", "new-name"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/old-name","user_login":"darl"}' },
				"branch -M users/darl/old-name new-name": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "detached HEAD cannot rename current",
			argv: ["branch", "-m", "new-name"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"221a90c5e860db5e3a6908a60863a0ed30494e0f","user_login":"darl"}' },
			},
			want: { stderr: "fatal: You are not currently on a branch.\n", code: 128 },
		},
		{
			name: "branch not found error passthrough",
			argv: ["branch", "-m", "nonexistent", "new-name"],
			arcReplies: {
				"branch -m nonexistent new-name": { stderr: "error: refname 'nonexistent' not found.\n", code: 128 },
			},
			want: { stderr: "error: refname 'nonexistent' not found.\n", code: 128 },
		},
	],
})
