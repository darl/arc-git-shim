// git rev-parse --show-toplevel --git-dir --git-common-dir
// --show-superproject-working-tree prints one line per requested value, in
// argument order: the working-tree root (absolute), the git dir, the common
// dir, then the enclosing superproject's working tree.  The superproject
// line is only emitted when this repository IS a submodule's working tree;
// an arc checkout can never be one (no nested repos), so it contributes no
// line — same as the git-dir-git-common-dir-superproject trio this extends.
// Arc has no worktree concept, so private and common git dirs are the same
// directory: <arcRoot>/.arc (relGitDir).  Pure path math, no arc call,
// mirroring the sibling trio; the shim's rev-parse family answers the dir
// flags cwd-relative consistently.
import { definePath, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-toplevel-git-dir-common-dir-superproject",
	summary: "toplevel + git-dir + git-common-dir + superproject probe, four-flag combo",
	spec: "rev-parse --show-toplevel --git-dir --git-common-dir --show-superproject-working-tree",

	async run(_args, ctx) {
		const gitDir = relGitDir(ctx)
		return ok(`${ctx.arcRoot}\n${gitDir}\n${gitDir}\n`)
	},

	fixtures: [
		{
			name: "at worktree root",
			argv: ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			arcReplies: {},
			want: { stdout: "/arcadia\n.arc\n.arc\n", code: 0 },
		},
		{
			name: "from subdirectory resolves relative",
			argv: ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "/arcadia\n../.arc\n../.arc\n", code: 0 },
		},
		{
			name: "from nested subdirectory",
			argv: ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"],
			cwd: "/arcadia/a/b/c",
			arcReplies: {},
			want: { stdout: "/arcadia\n../../../.arc\n../../../.arc\n", code: 0 },
		},
	],
})
