// git rev-parse --git-dir prints the path to the .git directory, relative to
// the current working directory when possible.  In an arc working tree the
// analogous directory is <arcRoot>/.arc (a symlink to the mount's store).
// The shim only dispatches inside an arc tree, so this is pure path math —
// no arc call needed.

import { posix } from "node:path"
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-git-dir",
	summary: "print the .arc directory path (relative to cwd)",
	spec: "rev-parse --git-dir",

	async run(_args, ctx) {
		const rel = posix.relative(ctx.cwd, ctx.arcRoot)
		return ok(`${rel ? rel + "/" : ""}.arc\n`)
	},

	fixtures: [
		{
			name: "at root prints .arc",
			argv: ["rev-parse", "--git-dir"],
			arcReplies: {},
			want: { stdout: ".arc\n", code: 0 },
		},
		{
			name: "from subdirectory prints ../.arc",
			argv: ["rev-parse", "--git-dir"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "../.arc\n", code: 0 },
		},
		{
			name: "from nested subdirectory",
			argv: ["rev-parse", "--git-dir"],
			cwd: "/arcadia/a/b/c",
			arcReplies: {},
			want: { stdout: "../../../.arc\n", code: 0 },
		},
	],
})
