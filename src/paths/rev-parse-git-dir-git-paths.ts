// git rev-parse --git-dir --git-path <p1> --git-path <p2> …  emits one line
// per flag, in argv order: the git-dir path, then <git-dir>/<path> for each
// --git-path.  In an arc tree the git dir is <arcRoot>/.arc, so this is pure
// path math — no arc call needed.
//
// The spec grammar has no "repeated value flag" construct, so we capture
// everything after --git-dir with `*` (required rest) and parse the
// --git-path pairs ourselves in refine.  Only the space-separated form
// (--git-path VALUE) is accepted; git's --git-path=VALUE equals form is NOT
// recognised as the flag by git (it echoes the literal), so refine rejects it
// and those shapes fall through to learning.
import { posix } from "node:path"
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-git-dir-git-paths",
	summary: "--git-dir plus one or more --git-path resolves into .arc",
	spec: "rev-parse --git-dir *",

	refine(args) {
		const rest = args.list.rest ?? []
		if (rest.length === 0) return false
		// Must be pairs of literal "--git-path" followed by a value (space form).
		for (let i = 0; i < rest.length; i += 2) {
			if (rest[i] !== "--git-path") return false // rejects --git-path=value
			if (i + 1 >= rest.length) return false // dangling --git-path
		}
		return true
	},

	async run(args, ctx) {
		const rel = posix.relative(ctx.cwd, ctx.arcRoot)
		const gitDir = `${rel ? rel + "/" : ""}.arc`
		const lines: string[] = [gitDir]
		const rest = args.list.rest ?? []
		for (let i = 0; i < rest.length; i += 2) {
			lines.push(`${gitDir}/${rest[i + 1]!}`)
		}
		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "git-dir with three git-paths at root",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index", "--git-path", "codex-synced-branch.json"],
			arcReplies: {},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/index\n.arc/codex-synced-branch.json\n", code: 0 },
		},
		{
			name: "git-dir with two git-paths at root",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index"],
			arcReplies: {},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/index\n", code: 0 },
		},
		{
			name: "git-dir with single git-path at root",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD"],
			arcReplies: {},
			want: { stdout: ".arc\n.arc/HEAD\n", code: 0 },
		},
		{
			name: "from subdirectory resolves relative",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "index", "--git-path", "codex-synced-branch.json"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "../.arc\n../.arc/HEAD\n../.arc/index\n../.arc/codex-synced-branch.json\n", code: 0 },
		},
		{
			name: "git-path with nested subpath",
			argv: ["rev-parse", "--git-dir", "--git-path", "HEAD", "--git-path", "objects/pack/pack.idx"],
			arcReplies: {},
			want: { stdout: ".arc\n.arc/HEAD\n.arc/objects/pack/pack.idx\n", code: 0 },
		},
	],
})
