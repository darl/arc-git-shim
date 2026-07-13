// git rev-parse --git-common-dir prints the path to the "common" git
// directory — the shared store that all linked worktrees point at.  In a
// plain (non-worktree) repository this is the same path as --git-dir.
// Arc has no worktree concept; <arcRoot>/.arc is both the private and the
// common dir, so this path mirrors rev-parse-git-dir: pure relative path
// math, no arc call needed.

import { posix } from "node:path"
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-git-common-dir",
	summary: "print the .arc directory path (relative to cwd)",
	spec: "rev-parse --git-common-dir",

	async run(_args, ctx) {
		const rel = posix.relative(ctx.cwd, ctx.arcRoot)
		return ok(`${rel ? rel + "/" : ""}.arc\n`)
	},

	fixtures: [
		{
			name: "at root prints .arc",
			argv: ["rev-parse", "--git-common-dir"],
			arcReplies: {},
			want: { stdout: ".arc\n", code: 0 },
		},
		{
			name: "from subdirectory prints ../.arc",
			argv: ["rev-parse", "--git-common-dir"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "../.arc\n", code: 0 },
		},
		{
			name: "from nested subdirectory",
			argv: ["rev-parse", "--git-common-dir"],
			cwd: "/arcadia/a/b/c",
			arcReplies: {},
			want: { stdout: "../../../.arc\n", code: 0 },
		},
	],
})
