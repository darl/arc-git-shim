// Arc's name-status output supplies the change class that its diff command
// cannot filter itself. This narrowly handles the HEAD/index deletion probe.
import { definePath, ok } from "../core"

export default definePath({
	name: "diff-cached-no-renames-deleted-names",
	summary: "NUL-delimited staged deletions against HEAD without rename detection",
	spec: "diff --cached --no-renames --name-only --diff-filter=D -z <rev> --",
	refine: (args) => args.pos.rev === "HEAD",
	async run(_args, ctx) {
		const r = await ctx.arc(["diff", "--cached", "--name-status", "HEAD"], { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const names = r.stdout.split("\n").filter((line) => line.startsWith("D\t")).map((line) => line.slice(2))
		return ok(names.map((name) => name + "\0").join(""))
	},
	fixtures: [
		{
			name: "only deleted staged paths are NUL terminated",
			argv: ["diff", "--cached", "--no-renames", "--name-only", "--diff-filter=D", "-z", "HEAD", "--"],
			arcReplies: { "diff --cached --name-status HEAD": { stdout: "M\tdir/keep.txt\nD\tdir/old file.txt\nA\tdir/new.txt\nD\tdir/other.txt\n" } },
			want: { stdout: "dir/old file.txt\0dir/other.txt\0", code: 0 },
		},
		{
			name: "no deletions produces empty output",
			argv: ["diff", "--cached", "--no-renames", "--name-only", "--diff-filter=D", "-z", "HEAD", "--"],
			arcReplies: { "diff --cached --name-status HEAD": { stdout: "M\tdir/keep.txt\n" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "arc failure propagates",
			argv: ["diff", "--cached", "--no-renames", "--name-only", "--diff-filter=D", "-z", "HEAD", "--"],
			arcReplies: { "diff --cached --name-status HEAD": { stderr: "arc error\n", code: 1 } },
			want: { stderr: "arc error\n", code: 1 },
		},
	],
})
