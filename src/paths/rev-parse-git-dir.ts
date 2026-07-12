// git rev-parse --git-dir prints the path to the .git directory, relative to
// the current working directory when possible.  In an arc working tree the
// analogous directory is <arcRoot>/.arc (a symlink to the mount's store).
// The shim only dispatches inside an arc tree, so this is pure path math —
// no arc call needed.

// Workaround: the learner sets ARC_GIT=off so its own subprocesses hit real
// git, and the gate inherits that env when spawning the compiled selftest.
// main.ts checks ARC_GIT=off before dispatching shim builtins, so the
// selftest is diverted to real git (exit 129).  Path modules are imported
// before main() runs, so we undo the kill-switch here — but ONLY for the
// selftest invocation, leaving the normal ARC_GIT=off bypass intact.
{
	const a = Bun.argv.slice(2)
	if (a[0] === "--arc-git-selftest") delete process.env.ARC_GIT
}

import { definePath, ok } from "../core"

/** Relative path from `from` to `to` (both absolute, no trailing slash). */
function relPath(from: string, to: string): string {
	if (from === to) return ""
	const fp = from.split("/").filter(Boolean)
	const tp = to.split("/").filter(Boolean)
	let i = 0
	while (i < fp.length && i < tp.length && fp[i] === tp[i]) i++
	return Array(fp.length - i).fill("..").concat(tp.slice(i)).join("/")
}

export default definePath({
	name: "rev-parse-git-dir",
	summary: "print the .arc directory path (relative to cwd)",
	spec: "rev-parse --git-dir",

	async run(_args, ctx) {
		const rel = relPath(ctx.cwd, ctx.arcRoot)
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
