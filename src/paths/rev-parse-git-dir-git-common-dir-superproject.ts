// git rev-parse --git-dir --git-common-dir --show-superproject-working-tree
// (observed trio from repo-indexing agents) prints one line per requested
// value, in argument order: the git dir, then the common dir, then the path
// of the enclosing superproject's working tree.  The superproject line is
// only emitted when this repository IS a submodule's working tree; in an arc
// checkout that can never be true (no nested .git modules), so it
// contributes no line at all — real git prints nothing for it either.
//
// Arc has no worktree concept, so the private and common git dirs are the
// same directory: <arcRoot>/.arc (relGitDir in core.ts says both flags).
// Pure path math, no arc call, mirroring rev-parse-git-dir /
// rev-parse-git-common-dir; note git itself only prints --git-dir relative
// when cwd is the toplevel (2.34 era prints it absolute from subdirs), but
// this shim's rev-parse family answers cwd-relative paths consistently.
import { definePath, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-git-dir-git-common-dir-superproject",
	summary: "--git-dir + --git-common-dir + superproject probe, .arc twice",
	spec: "rev-parse --git-dir --git-common-dir --show-superproject-working-tree",

	async run(_args, ctx) {
		const gitDir = relGitDir(ctx)
		return ok(`${gitDir}\n${gitDir}\n`)
	},

	fixtures: [
		{
			name: "at worktree root",
			argv: ["rev-parse", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			arcReplies: {},
			want: { stdout: ".arc\n.arc\n", code: 0 },
		},
		{
			name: "from subdirectory resolves relative",
			argv: ["rev-parse", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "../.arc\n../.arc\n", code: 0 },
		},
		{
			name: "from nested subdirectory",
			argv: ["rev-parse", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			cwd: "/arcadia/a/b/c",
			arcReplies: {},
			want: { stdout: "../../../.arc\n../../../.arc\n", code: 0 },
		},
	],
})
