// Review guides request root-relative file names with fixed patch prefixes.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-name-only-prefixed-range",
	summary: "NUL-delimited changed paths for a revision range",
	spec: "diff --src-prefix=a/ --dst-prefix=b/ --name-only -z <rev>",
	async run(args, ctx) {
		const revs = await expandDiffRev(ctx, args.pos.rev!, true)
		if (isExecResult(revs)) return revs
		const r = await ctx.arc(["diff", "--name-only", ...revs], { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const names = r.stdout.split("\n").filter(Boolean)
		return ok(names.length ? names.join("\0") + "\0" : "")
	},
	fixtures: [
		{
			name: "three-dot names measured from merge base",
			argv: ["diff", "--src-prefix=a/", "--dst-prefix=b/", "--name-only", "-z", "trunk...HEAD"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "a".repeat(40) + "\n" },
				["diff --name-only " + "a".repeat(40) + " HEAD"]: { stdout: "dir/file.txt\ndir/with space.txt\n" },
			},
			want: { stdout: "dir/file.txt\0dir/with space.txt\0", code: 0 },
		},
		{
			name: "empty change returns no NUL record",
			argv: ["diff", "--src-prefix=a/", "--dst-prefix=b/", "--name-only", "-z", "trunk..HEAD"],
			arcReplies: { "diff --name-only trunk HEAD": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
	],
})
