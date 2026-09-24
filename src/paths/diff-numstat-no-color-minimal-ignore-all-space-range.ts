// git diff --find-renames --no-color [--no-ext-diff] [--no-textconv]
//   --minimal --src-prefix=<x> [--dst-prefix=<y>] --ignore-all-space
//   --numstat [-z] [<range>] -- [<paths>...]
// The codex-style flag cluster (no-color/no-ext-diff/no-textconv/minimal/
// explicit prefixes) over a rev range with --numstat output — the sibling
// numstat paths each miss this shape: diff-numstat and diff-rev-numstat-
// separator don't declare --ignore-all-space/--minimal/--no-color/--src-prefix
// at all, and diff-raw-numstat requires --raw. Probed against native git:
// the shape is valid, and --numstat -z emits "add\tdel\tpath" rows with the
// tabs kept and a NUL as the record terminator.
//
// Same numstat-from-unified-diff strategy as the family: one `arc diff --git`
// call, +/- lines counted per file via numstatFromUnified (binary → "-\t-\t").
// --ignore-all-space maps 1:1 to arc's -w (whitespace-only lines stop
// counting as changes, exactly what git's numstat does with -w). -M/
// --find-renames is accepted and dropped — arc rename detection degrades to
// A+D pairs, structure stays valid (same stance as diff-raw-numstat).
// --no-color/--no-ext-diff/--no-textconv/--minimal and the prefix flags are
// no-ops for numstat: they shape the patch body, not the per-file counts
// (prefixes never reach numstat rows, which carry bare paths).
//
// The rev-ish goes through expandDiffRev: "x...y" → merge-base(x,y) y,
// "x..y" → open ends, a lone rev gets the merge-base worktree lens (trunk
// drifts, so a literal `git diff trunk` would drown the caller's changes in
// fresh trunk commits). A bare invocation (no rev, trailing "--") diffs the
// index against the worktree at the invocation cwd. With "--" present, git
// rejects an unresolvable rev with `fatal: bad revision '<arg>'` (verified
// against native git for both lone revs and ranges) — not the
// ambiguous-argument form it uses without the separator.
import { definePath, expandDiffRev, fail, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-numstat-no-color-minimal-ignore-all-space-range",
	summary: "numstat for the no-color/minimal/ignore-all-space cluster over a rev range via arc diff --git -w",
	spec:
		"diff (-M|--find-renames) --no-color --no-ext-diff? --no-textconv? --minimal --src-prefix=<src> --dst-prefix=<dst>? --ignore-all-space --numstat -z? <range>? -- <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git", "-w"]
		if (args.pos.range) {
			const t = await expandDiffRev(ctx, args.pos.range, true)
			if (isExecResult(t)) return fail(128, `fatal: bad revision '${args.pos.range}'\n`)
			arcArgs.push(...t)
		}
		if (args.list.paths?.length) arcArgs.push("--", ...args.list.paths)
		// a rev-anchored diff is cwd-independent → arcRoot; the bare diff is
		// index-vs-worktree and must run at the invocation cwd
		const r = await ctx.arc(arcArgs, args.pos.range ? { cwd: ctx.arcRoot } : undefined)
		if (r.code !== 0) {
			return args.pos.range ? fail(128, `fatal: bad revision '${args.pos.range}'\n`) : r
		}
		const rows = numstatFromUnified(r.stdout)
		// tabs survive -z; only the record terminator switches \n → NUL
		const term = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${term}`).join(""))
	},

	fixtures: [
		{
			name: "three-dot range, NUL-terminated rows, origin alias resolved",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--numstat", "-z",
				"origin/trunk...HEAD", "--",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b\n" },
				"diff --git -w 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b HEAD": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1,3 +1,4 @@\n" +
						"+added line\n" +
						" context\n" +
						"-removed line\n" +
						"+changed\n" +
						"diff --git a/code/mod.go b/code/mod.go\n" +
						"--- a/code/mod.go\n" +
						"+++ b/code/mod.go\n" +
						"@@ -1 +1,2 @@\n" +
						"+x\n",
				},
			},
			want: { stdout: "2\t1\tdir/sub/file.txt\x001\t0\tcode/mod.go\0", code: 0 },
		},
		{
			name: "two-dot range, newline-terminated, no merge-base probe",
			argv: [
				"diff", "--find-renames", "--no-color", "--minimal",
				"--src-prefix=a/", "--ignore-all-space", "--numstat", "trunk..HEAD", "--",
			],
			arcReplies: {
				"diff --git -w trunk HEAD": {
					stdout:
						"diff --git a/keep.txt b/keep.txt\n" +
						"--- a/keep.txt\n" +
						"+++ b/keep.txt\n" +
						"@@ -1 +1 @@\n" +
						"-old\n" +
						"+new\n",
				},
			},
			want: { stdout: "1\t1\tkeep.txt\n", code: 0 },
		},
		{
			name: "lone rev uses the merge-base worktree lens",
			argv: [
				"diff", "-M", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--numstat", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a\n" },
				"diff --git -w 2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1 +1 @@\n" +
						"-x\n" +
						"+y\n",
				},
			},
			want: { stdout: "1\t1\tdir/sub/file.txt\n", code: 0 },
		},
		{
			name: "pathspec filter after the separator",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--numstat", "-z",
				"origin/trunk...HEAD", "--", "dir/sub/file.txt",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b\n" },
				"diff --git -w 3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b HEAD -- dir/sub/file.txt": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1 +1,2 @@\n" +
						"+new\n",
				},
			},
			want: { stdout: "1\t0\tdir/sub/file.txt\0", code: 0 },
		},
		{
			name: "bare with separator: index vs worktree at invocation cwd",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--numstat", "--",
			],
			arcReplies: {
				"diff --git -w": {
					stdout:
						"diff --git a/code/mod.go b/code/mod.go\n" +
						"--- a/code/mod.go\n" +
						"+++ b/code/mod.go\n" +
						"@@ -1 +1 @@\n" +
						"-x\n" +
						"+y\n",
				},
			},
			want: { stdout: "1\t1\tcode/mod.go\n", code: 0 },
		},
		{
			name: "binary file dashes",
			argv: [
				"diff", "--find-renames", "--no-color", "--minimal",
				"--src-prefix=a/", "--ignore-all-space", "--numstat", "-z", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c\n" },
				"diff --git -w 4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c": {
					stdout: "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n",
				},
			},
			want: { stdout: "-\t-\tassets/logo.png\0", code: 0 },
		},
		{
			name: "empty diff",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--numstat", "-z",
				"origin/trunk...HEAD", "--",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d\n" },
				"diff --git -w 5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d HEAD": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "unknown endpoint: git's bad-revision fatal (with -- separator)",
			argv: [
				"diff", "--find-renames", "--no-color", "--minimal",
				"--src-prefix=a/", "--ignore-all-space", "--numstat", "nosuchrev...HEAD", "--",
			],
			arcReplies: {
				"merge-base nosuchrev HEAD": { stderr: "Error: unknown revision\n", code: 1 },
			},
			want: { stdout: "", stderr: "fatal: bad revision 'nosuchrev...HEAD'\n", code: 128 },
		},
	],
})
