// git diff --raw --numstat [<rev>] [-- <paths>]: combined raw-metadata +
// numstat output. git emits ALL raw lines first, then ALL numstat lines.
// arc has neither --raw nor --numstat; the shim parses one `arc diff --git`
// unified diff to extract status letters, paths, and +/- line counts in a
// single pass, then formats both sections.
//
// --raw needs blob hashes and file modes that arc does not expose; blob
// hashes are emitted as all-zeros (40 chars with --no-abbrev, 7 without).
// Modes are derived from status: A→000000/100644, M→100644/100644,
// D→100644/000000. Status letters and paths are accurate; numstat is
// computed from +/- line counts exactly like numstatFromUnified.
//
// A lone rev diffs the working tree from merge-base(rev, HEAD) — see
// expandDiffRev (trunk moves constantly in arcadia; a literal `git diff
// trunk` would drown the caller's changes in fresh trunk commits).
// -M/--find-renames is accepted and dropped (arc rename detection degrades
// to A+D pairs — structure stays valid). --no-ext-diff, --no-textconv,
// --color, --src-prefix, --dst-prefix are accepted and ignored: they affect
// the patch format, not raw or numstat output.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

interface DiffEntry {
	status: string // A, M, D
	path: string
	add: number | "-"
	del: number | "-"
}

/** Parse one arc diff --git unified diff into per-file entries with status,
 * path, and +/- line counts (binary → "-"). Mirrors numstatFromUnified but
 * also detects A/D from "new file mode" / "deleted file mode" headers. */
function parseDiffEntries(diff: string): DiffEntry[] {
	const entries: DiffEntry[] = []
	let cur: { status: string; path: string; add: number; del: number; binary: boolean } | null = null
	const flush = () => {
		if (cur)
			entries.push({
				status: cur.status,
				path: cur.path,
				add: cur.binary ? "-" : cur.add,
				del: cur.binary ? "-" : cur.del,
			})
		cur = null
	}
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git ")) {
			const m = line.match(/^diff --git a\/(.*) b\/(.*)$/)
			if (m) {
				flush()
				cur = { status: "M", path: m[2]!, add: 0, del: 0, binary: false }
				continue
			}
		}
		if (!cur) continue
		if (line.startsWith("new file mode")) cur.status = "A"
		else if (line.startsWith("deleted file mode")) cur.status = "D"
		else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) cur.binary = true
		else if (line.startsWith("+") && !line.startsWith("+++")) cur.add++
		else if (line.startsWith("-") && !line.startsWith("---")) cur.del++
	}
	flush()
	return entries
}

export default definePath({
	name: "diff-raw-numstat",
	summary: "combined --raw and --numstat from one arc diff --git call",
	spec: "diff --no-ext-diff? --no-textconv? --color=<mode>? --src-prefix=<src>? --dst-prefix=<dst>? (-M|--find-renames)? --raw --no-abbrev? --numstat -z? <rev>? -- <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		if (args.list.paths?.length) arcArgs.push("--", ...args.list.paths)

		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r

		const entries = parseDiffEntries(r.stdout)
		const z = args.flags.has("-z")
		const hashLen = args.flags.has("--no-abbrev") ? 40 : 7
		const zeros = "0".repeat(hashLen)

		// git --raw: ":<old-mode> <new-mode> <old-hash> <new-hash> <status>\t<path>"
		// with -z: NUL replaces the tab before the path and terminates the record
		const rawSep = z ? "\0" : "\t"
		const rawTerm = z ? "\0" : "\n"
		const rawPart = entries
			.map((e) => {
				const oldMode = e.status === "A" ? "000000" : "100644"
				const newMode = e.status === "D" ? "000000" : "100644"
				return `:${oldMode} ${newMode} ${zeros} ${zeros} ${e.status}${rawSep}${e.path}${rawTerm}`
			})
			.join("")

		// git --numstat: "add\tdel\tpath" (tabs stay even with -z; NUL terminates)
		const numTerm = z ? "\0" : "\n"
		const numstatPart = entries.map((e) => `${e.add}\t${e.del}\t${e.path}${numTerm}`).join("")

		return ok(rawPart + numstatPart)
	},

	fixtures: [
		{
			name: "modified and added files, --no-abbrev",
			argv: [
				"diff", "--no-ext-diff", "--no-textconv", "--color=never", "--src-prefix=a/",
				"--dst-prefix=b/", "abc123def456", "--find-renames", "--raw", "--no-abbrev",
				"--numstat", "--", "dir/sub/file1.txt", "dir/sub/file2.txt",
			],
			arcReplies: {
				"merge-base abc123def456 HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 -- dir/sub/file1.txt dir/sub/file2.txt": {
					stdout:
						"diff --git a/dir/sub/file1.txt b/dir/sub/file1.txt\n" +
						"--- a/dir/sub/file1.txt\n" +
						"+++ b/dir/sub/file1.txt\n" +
						"@@ -1,3 +1,4 @@\n" +
						"+added line\n" +
						" context\n" +
						"-removed line\n" +
						"+changed\n" +
						"diff --git a/dir/sub/file2.txt b/dir/sub/file2.txt\n" +
						"new file mode 100644\n" +
						"--- /dev/null\n" +
						"+++ b/dir/sub/file2.txt\n" +
						"@@ -0,0 +1 @@\n" +
						"+new content\n",
				},
			},
			want: {
				stdout:
					":100644 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 M\tdir/sub/file1.txt\n" +
					":000000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 A\tdir/sub/file2.txt\n" +
					"2\t1\tdir/sub/file1.txt\n" +
					"1\t0\tdir/sub/file2.txt\n",
				code: 0,
			},
		},
		{
			name: "NUL-delimited, 7-char hashes (no --no-abbrev)",
			argv: ["diff", "--raw", "--numstat", "-z", "abc123", "--", "dir/sub/file1.txt"],
			arcReplies: {
				"merge-base abc123 HEAD": { stdout: "a1b2c3d4e5f6\n" },
				"diff --git a1b2c3d4e5f6 -- dir/sub/file1.txt": {
					stdout:
						"diff --git a/dir/sub/file1.txt b/dir/sub/file1.txt\n" +
						"--- a/dir/sub/file1.txt\n" +
						"+++ b/dir/sub/file1.txt\n" +
						"@@ -1 +2 @@\n" +
						"-old\n" +
						"+new\n" +
						"+extra\n",
				},
			},
			want: {
				stdout: ":100644 100644 0000000 0000000 M\0dir/sub/file1.txt\x002\t1\tdir/sub/file1.txt\0",
				code: 0,
			},
		},
		{
			name: "binary file dashes",
			argv: ["diff", "--raw", "--numstat", "abc123", "--", "dir/sub/img.png"],
			arcReplies: {
				"merge-base abc123 HEAD": { stdout: "a1b2c3d4e5f6\n" },
				"diff --git a1b2c3d4e5f6 -- dir/sub/img.png": {
					stdout:
						"diff --git a/dir/sub/img.png b/dir/sub/img.png\n" +
						"Binary files a/dir/sub/img.png and b/dir/sub/img.png differ\n",
				},
			},
			want: {
				stdout:
					":100644 100644 0000000 0000000 M\tdir/sub/img.png\n" +
					"-\t-\tdir/sub/img.png\n",
				code: 0,
			},
		},
		{
			name: "deleted file",
			argv: ["diff", "--raw", "--numstat", "abc123", "--", "dir/sub/old.txt"],
			arcReplies: {
				"merge-base abc123 HEAD": { stdout: "a1b2c3d4e5f6\n" },
				"diff --git a1b2c3d4e5f6 -- dir/sub/old.txt": {
					stdout:
						"diff --git a/dir/sub/old.txt b/dir/sub/old.txt\n" +
						"deleted file mode 100644\n" +
						"--- a/dir/sub/old.txt\n" +
						"+++ /dev/null\n" +
						"@@ -1,2 +0,0 @@\n" +
						"-line1\n" +
						"-line2\n",
				},
			},
			want: {
				stdout:
					":100644 000000 0000000 0000000 D\tdir/sub/old.txt\n" +
					"0\t2\tdir/sub/old.txt\n",
				code: 0,
			},
		},
	],
})
