// Arc's structured name list includes directories; git lists files at the
// repository root even when invoked from a subdirectory.
import { arcJson, arcRev, definePath, fail, isExecResult, ok } from "../core"
import { renderCommit, type LogEntry } from "../gitlog"

type Names = { names?: { type: string; path: string }[]; commits?: LogEntry[] }

function quotePath(path: string): string {
	const bytes = new TextEncoder().encode(path)
	if (!bytes.some((b) => b < 32 || b >= 127 || b === 34 || b === 92)) return path
	let result = '"'
	for (const b of bytes) {
		if (b === 34 || b === 92) result += `\\${String.fromCharCode(b)}`
		else if (b === 9) result += "\\t"
		else if (b === 10) result += "\\n"
		else if (b === 13) result += "\\r"
		else if (b < 32 || b >= 127) result += `\\${b.toString(8).padStart(3, "0")}`
		else result += String.fromCharCode(b)
	}
	return result + '"'
}

export default definePath({
	name: "show-name-only-subject",
	summary: "commit subject and changed file names",
	spec: "show --name-only --format=<fmt> <rev>",
	refine: (args) => args.pos.fmt === "%s" && !args.pos.rev!.includes(":"),
	async run(args, ctx) {
		const rev = arcRev(args.pos.rev!)
		const result = await arcJson<Names[]>(ctx, ["show", "--json", "--name-only", rev], { cwd: ctx.arcRoot })
		if (isExecResult(result)) return result
		const entry = result[0]?.commits?.[0]
		if (!entry) return fail(128, `fatal: bad revision '${args.pos.rev}'\n`)
		let names = (result[0]?.names ?? []).filter((n) => n.type === "file").map((n) => n.path)
		// Git's default combined merge diff lists only paths changed against
		// every parent, rather than all paths changed against the first.
		if ((entry.parents?.length ?? 0) > 1) {
			for (const parent of entry.parents!.slice(1)) {
				const diff = await arcJson<Names[]>(ctx, ["diff", "--json", "--name-only", parent, rev], { cwd: ctx.arcRoot })
				if (isExecResult(diff)) return diff
				const paths = new Set((diff[0]?.names ?? []).filter((n) => n.type === "file").map (n => n.path))
				names = names.filter((name) => paths.has(name))
			}
		}
		const subject = renderCommit("%s", entry)
		return ok(`${subject}\n${names.length ? `\n${names.map(quotePath).join("\n")}\n` : ""}`)
	},
	fixtures: [
		{
			name: "subject and root-relative files",
			argv: ["show", "--name-only", "--format=%s", "abc123"],
			cwd: "/repo/sub",
			arcReplies: { "show --json --name-only abc123": { stdout: '[{"commits":[{"commit":"abc123","author":"a","date":"2024-01-01","message":"Example subject\\n\\nBody"}],"names":[{"type":"directory","path":"dir"},{"type":"file","path":"dir/file.txt"},{"type":"file","path":"tab\\tfile"}]}]' } },
			want: { stdout: 'Example subject\n\ndir/file.txt\n"tab\\tfile"\n', code: 0 },
		},
		{
			name: "merge only reports files changed against both parents",
			argv: ["show", "--name-only", "--format=%s", "origin/feature"],
			arcReplies: {
				"show --json --name-only arcadia/feature": { stdout: '[{"commits":[{"commit":"abc","parents":["p1","p2"],"author":"a","date":"2024-01-01","message":"Merge"}],"names":[{"type":"file","path":"both"},{"type":"file","path":"first"}]}]' },
				"diff --json --name-only p2 arcadia/feature": { stdout: '[{"names":[{"type":"file","path":"both"}]}]' },
			},
			want: { stdout: "Merge\n\nboth\n", code: 0 },
		},
		{
			name: "arc failure propagates",
			argv: ["show", "--name-only", "--format=%s", "missing"],
			arcReplies: { "show --json --name-only missing": { code: 1, stderr: "revision not found\n" } },
			want: { code: 1, stderr: "revision not found\n" },
		},
	],
})
