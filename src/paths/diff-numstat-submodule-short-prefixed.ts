// Arc's unified diff supplies numstat counts; as in the other numstat paths,
// rename detection is not enabled, so moves may appear as delete/add pairs.
import { definePath, expandDiffRev, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-numstat-submodule-short-prefixed",
	summary: "NUL-delimited numstat with short submodule format",
	spec: "diff --find-renames --no-color --no-ext-diff --no-textconv --submodule=short --src-prefix=a/ --dst-prefix=b/ --numstat -z <rev> --",

	async run(args, ctx) {
		const revs = await expandDiffRev(ctx, args.pos.rev!, true)
		if (isExecResult(revs)) return revs
		const result = await ctx.arc(["diff", "--git", ...revs], { cwd: ctx.arcRoot })
		if (result.code !== 0) return result
		return ok(numstatFromUnified(result.stdout).map((row) => `${row.add}\t${row.del}\t${row.path}\0`).join(""))
	},

	fixtures: [
		{
			name: "text and binary changes against a revision",
			argv: ["diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--submodule=short", "--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z", "abc123", "--"],
			arcReplies: {
				"merge-base abc123 HEAD": { stdout: "def456\n" },
				"diff --git def456": { stdout: "diff --git a/dir/file.txt b/dir/file.txt\n--- a/dir/file.txt\n+++ b/dir/file.txt\n@@ -1 +1,2 @@\n-old\n+new\n+extra\ndiff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n" },
			},
			want: { stdout: "2\t1\tdir/file.txt\0-\t-\timg.png\0", code: 0 },
		},
		{
			name: "empty range",
			argv: ["diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--submodule=short", "--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z", "origin/trunk..HEAD", "--"],
			arcReplies: { "diff --git arcadia/trunk HEAD": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "diff failure propagates",
			argv: ["diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--submodule=short", "--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z", "badrev", "--"],
			arcReplies: { "merge-base badrev HEAD": { code: 1 }, "diff --git badrev": { code: 1, stderr: "revision not found\n" } },
			want: { code: 1, stderr: "revision not found\n" },
		},
	],
})
