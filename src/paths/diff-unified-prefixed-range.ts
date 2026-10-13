// Arc's --git output already uses a/ and b/; preserve zero-context hunk locations.
import { definePath, expandDiffRev, isExecResult } from "../core"

export default definePath({
	name: "diff-unified-prefixed-range",
	summary: "fixed-prefix patch with explicit context size",
	spec: "diff --src-prefix=a/ --dst-prefix=b/ --unified=<lines> --no-color --no-ext-diff <rev>",
	refine: args => /^\d+$/.test(args.pos.lines!),
	async run(args, ctx) {
		const revs = await expandDiffRev(ctx, args.pos.rev!, true)
		if (isExecResult(revs)) return revs
		return ctx.arc(["diff", "--git", "--unified", args.pos.lines!, "--no-color", ...revs], { cwd: ctx.arcRoot })
	},
	fixtures: [
		{
			name: "zero context preserved after resolving the range",
			argv: ["diff", "--src-prefix=a/", "--dst-prefix=b/", "--unified=0", "--no-color", "--no-ext-diff", "trunk...HEAD"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "a".repeat(40) + "\n" },
				["diff --git --unified 0 --no-color " + "a".repeat(40) + " HEAD"]: {
					stdout: "diff --git a/dir/file.txt b/dir/file.txt\n--- a/dir/file.txt\n+++ b/dir/file.txt\n@@ -2 +2 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "diff --git a/dir/file.txt b/dir/file.txt\n--- a/dir/file.txt\n+++ b/dir/file.txt\n@@ -2 +2 @@\n-old\n+new\n", code: 0 },
		},
		{
			name: "merge-base failure does not produce a patch",
			argv: ["diff", "--src-prefix=a/", "--dst-prefix=b/", "--unified=0", "--no-color", "--no-ext-diff", "missing...HEAD"],
			arcReplies: { "merge-base missing HEAD": { code: 1, stderr: "unknown revision\n" } },
			want: { stdout: "", stderr: "unknown revision\n", code: 1 },
		},
	],
})
