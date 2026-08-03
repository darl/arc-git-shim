// git rev-parse --git-path <path> resolves <path> inside the git directory,
// returning the result relative to cwd (e.g. ".git/HEAD" from repo root,
// "../.git/HEAD" from a subdir).  In an arc working tree the analogous
// directory is <arcRoot>/.arc, so the shim emits "<.arc-rel-to-cwd>/<path>".
// Pure path math — no arc call needed (relGitDir in core.ts).
import { definePath, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-git-path",
	summary: "resolve a path inside the .arc directory (relative to cwd)",
	spec: "rev-parse --git-path=<path>",

	async run(args, ctx) {
		return ok(`${relGitDir(ctx)}/${args.pos.path!}\n`)
	},

	fixtures: [
		{
			name: "HEAD at root",
			argv: ["rev-parse", "--git-path", "HEAD"],
			arcReplies: {},
			want: { stdout: ".arc/HEAD\n", code: 0 },
		},
		{
			name: "objects path at root",
			argv: ["rev-parse", "--git-path", "objects/abc"],
			arcReplies: {},
			want: { stdout: ".arc/objects/abc\n", code: 0 },
		},
		{
			name: "HEAD from subdirectory",
			argv: ["rev-parse", "--git-path", "HEAD"],
			cwd: "/arcadia/src",
			arcReplies: {},
			want: { stdout: "../.arc/HEAD\n", code: 0 },
		},
		{
			name: "config from nested subdirectory",
			argv: ["rev-parse", "--git-path", "config"],
			cwd: "/arcadia/a/b/c",
			arcReplies: {},
			want: { stdout: "../../../.arc/config\n", code: 0 },
		},
		{
			name: "equals form resolves identically",
			argv: ["rev-parse", "--git-path=HEAD"],
			arcReplies: {},
			want: { stdout: ".arc/HEAD\n", code: 0 },
		},
	],
})
