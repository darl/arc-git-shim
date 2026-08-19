// git rev-parse --git-dir --git-path <p1> --git-path <p2> … --symbolic-full-name HEAD
// Emits one line per requested value, in argv order:
//   1. the git-dir path (relative to cwd)          → relGitDir
//   2. <git-dir>/<path> for each --git-path         → pure path math
//   3. full symbolic name of HEAD                   → refs/heads/<branch>,
//      or "HEAD" when detached (arc info --json).
//
// Shares the "rev-parse --git-dir *" spec with rev-parse-git-dir-git-paths;
// the two are disambiguated by refine — that path accepts only pure
// --git-path <v> pairs, this path requires those pairs followed by
// --symbolic-full-name HEAD.  No argv can satisfy both refines, so there is
// no equal-specificity collision.  Only the space-separated --git-path form
// is accepted; the equals form (--git-path=HEAD) is rejected because real
// git echoes it literally (it is not a --flag=value option).
import { arcInfo, definePath, isDetached, isExecResult, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-git-dir-git-paths-symbolic-full-name",
	summary: "--git-dir + --git-path resolves + --symbolic-full-name HEAD combo",
	spec: "rev-parse --git-dir *",

	refine(args) {
		const rest = args.list.rest ?? []
		// Need at least: --git-path <v> --symbolic-full-name HEAD (4 tokens)
		if (rest.length < 4) return false
		// Walk --git-path <value> pairs (space form only).
		let i = 0
		while (i < rest.length && rest[i] === "--git-path") {
			if (i + 1 >= rest.length) return false // dangling --git-path
			i += 2
		}
		// At least one --git-path pair is required.
		if (i === 0) return false
		// After the pairs, exactly --symbolic-full-name HEAD must remain.
		if (i !== rest.length - 2) return false
		if (rest[i] !== "--symbolic-full-name") return false
		if (rest[i + 1] !== "HEAD") return false
		return true
	},

	async run(args, ctx) {
		const gitDir = relGitDir(ctx)
		const lines: string[] = [gitDir]
		const rest = args.list.rest ?? []
		let i = 0
		while (i < rest.length && rest[i] === "--git-path") {
			lines.push(`${gitDir}/${rest[i + 1]!}`)
			i += 2
		}
		// i now points at --symbolic-full-name; resolve HEAD's symbolic name.
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		lines.push(isDetached(info.branch) ? "HEAD" : `refs/heads/${info.branch}`)
		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "on a branch at root, three git-paths",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index", "--git-path", "codex-synced-branch.json", "--symbolic-full-name", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/feature-x","user_login":"darl"}' },
			},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/index\n.arc/codex-synced-branch.json\nrefs/heads/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "detached HEAD at root, two git-paths",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index", "--symbolic-full-name", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}' },
			},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/index\nHEAD\n", code: 0 },
		},
		{
			name: "from subdirectory resolves relative",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index", "--symbolic-full-name", "HEAD"],
			cwd: "/arcadia/src",
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/feature-x","user_login":"darl"}' },
			},
			want: { stdout: "../.arc\n../.arc/HEAD\n../.arc/index\nrefs/heads/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "single git-path on a branch",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--symbolic-full-name", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"pr-12345678","user_login":"darl"}' },
			},
			want: { stdout: ".arc\n.arc/HEAD\nrefs/heads/pr-12345678\n", code: 0 },
		},
		{
			name: "nested git-path subpath",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "objects/pack/pack.idx", "--symbolic-full-name", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/feature-x","user_login":"darl"}' },
			},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/objects/pack/pack.idx\nrefs/heads/users/darl/feature-x\n", code: 0 },
		},
	],
})
