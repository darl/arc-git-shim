// Subject plus directory-scoped diffstat. Arc's stat is prose (its graph
// differs from git's), but --relative=. restricts it to the invocation cwd.
import { arcJson, arcRev, definePath, isExecResult, ok } from "../core"
import { renderCommit, type LogEntry } from "../gitlog"

export default definePath({
	name: "show-stat-subject-directory",
	summary: "commit subject and cwd-scoped diffstat",
	spec: "show --stat --format=<fmt> <rev> -- <path>",
	refine: (args) => args.pos.fmt === "%s" && args.pos.path === "." && !args.pos.rev!.includes(":"),

	async run(args, ctx) {
		const rev = arcRev(args.pos.rev!)
		const entries = await arcJson<LogEntry[]>(ctx, ["log", "--json", "-n", "1", rev])
		if (isExecResult(entries)) return entries
		if (!entries[0]) return { stdout: "", stderr: `fatal: bad revision '${args.pos.rev}'\n`, code: 128 }
		const stat = await ctx.arc(["show", "--git", "--stat", "--relative=.", rev])
		if (stat.code !== 0) return stat
		// The final unindented paragraph is the stat; commit-message lines in
		// arc show are indented, including blank lines within the message.
		const match = stat.stdout.match(/\n\n((?: [^\n]* \|[^\n]*\n)+ \d+ files? changed[^\n]*\n)$/)
		return ok(`${renderCommit("%s", entries[0])}\n${match ? `\n${match[1]}` : ""}`)
	},

	fixtures: [
		{
			name: "subject and scoped stat",
			argv: ["show", "--stat", "--format=%s", "abc123", "--", "."],
			arcReplies: {
				"log --json -n 1 abc123": { stdout: '[{"commit":"abc123","author":"user","date":"2024-01-01","message":"A subject\\n\\nBody"}]' },
				"show --git --stat --relative=. abc123": { stdout: "commit abc123\nauthor: user\n\n    A subject\n    \n    Body\n\n dir/file.txt | ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)\n" },
			},
			want: { stdout: "A subject\n\n dir/file.txt | ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)\n", code: 0 },
		},
		{
			name: "no changes in directory",
			argv: ["show", "--stat", "--format=%s", "HEAD", "--", "."],
			arcReplies: {
				"log --json -n 1 HEAD": { stdout: '[{"commit":"abc123","author":"user","date":"2024-01-01","message":"Subject"}]' },
				"show --git --stat --relative=. HEAD": { stdout: "commit abc123\n\n    Subject\n" },
			},
			want: { stdout: "Subject\n", code: 0 },
		},
		{
			name: "arc failure propagates",
			argv: ["show", "--stat", "--format=%s", "missing", "--", "."],
			arcReplies: { "log --json -n 1 missing": { stderr: "revision not found\n", code: 1 } },
			want: { stderr: "revision not found\n", code: 1 },
		},
	],
})
