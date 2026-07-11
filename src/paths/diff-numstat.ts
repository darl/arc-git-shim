// orca: diff [-z] --numstat -M -C [<a> <b>] → "added\tdeleted\tpath" per file.
// arc has no --numstat; the shim parses one arc diff --git unified diff and
// counts +/- lines per file (binary files → "-\t-\tpath", like git).
import { definePath, ok } from "../core"

export function numstatFromUnified(diff: string): { add: number | "-"; del: number | "-"; path: string }[] {
	const out: { add: number | "-"; del: number | "-"; path: string }[] = []
	let cur: { add: number; del: number; path: string; binary: boolean } | null = null
	const flush = () => {
		if (cur) out.push(cur.binary ? { add: "-", del: "-", path: cur.path } : { add: cur.add, del: cur.del, path: cur.path })
		cur = null
	}
	for (const line of diff.split("\n")) {
		const m = line.match(/^diff --git a\/(.*) b\/(.*)$/)
		if (m) {
			flush()
			cur = { add: 0, del: 0, path: m[2]!, binary: false }
			continue
		}
		if (!cur) continue
		if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) cur.binary = true
		else if (line.startsWith("+") && !line.startsWith("+++")) cur.add++
		else if (line.startsWith("-") && !line.startsWith("---")) cur.del++
	}
	flush()
	return out
}

export default definePath({
	name: "diff-numstat",
	summary: "numstat computed from one arc diff --git call",
	spec: "diff -z? --numstat (-M|--find-renames)? (-C|--find-copies)? <a>? <b>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.a !== undefined) arcArgs.push(args.pos.a)
		if (args.pos.b !== undefined) arcArgs.push(args.pos.b)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const rows = numstatFromUnified(r.stdout)
		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${sep}`).join(""))
	},

	fixtures: [
		{
			name: "counts from unified diff",
			argv: ["diff", "--numstat", "-M", "-C", "HEAD~1", "HEAD"],
			arcReplies: {
				"diff --git HEAD~1 HEAD": {
					stdout:
						"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1,3 +1,4 @@\n+added line\n context\n-removed line\n+changed\n",
				},
			},
			want: { stdout: "2\t1\tfoo.go\n", code: 0 },
		},
		{
			name: "binary file dashes, NUL-delimited",
			argv: ["diff", "-z", "--numstat", "a1", "b2"],
			arcReplies: {
				"diff --git a1 b2": {
					stdout: "diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n",
				},
			},
			want: { stdout: "-\t-\timg.png\0", code: 0 },
		},
	],
})
