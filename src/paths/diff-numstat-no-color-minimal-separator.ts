// git diff --find-renames --no-color [--no-ext-diff] [--no-textconv]
//   --minimal --src-prefix=<x> [--dst-prefix=<y>] --numstat [-z] [<rev>] -- [<paths>...]
// The no-color/no-ext-diff/no-textconv/minimal/explicit-prefix cluster with
// --numstat output — the same codex-style flag set as the ignore-all-space
// sibling, minus --ignore-all-space. No existing path declares this exact
// shape: diff-numstat and diff-rev-numstat-separator don't take
// --no-color/--minimal/--src-prefix; the ignore-all-space sibling REQUIRES
// --ignore-all-space, so strict parsing leaves this argv unclaimed. Probed
// against native git: the shape is valid, and --numstat -z emits
// "add\tdel\tpath" rows with tabs kept and NUL as the record terminator.
//
// Same numstat-from-unified-diff strategy as the family: one `arc diff --git`
// call, +/- lines counted per file via numstatFromUnified (binary → "-\t-\t").
// -M/--find-renames is accepted and dropped — arc rename detection degrades
// to A+D pairs, structure stays valid (same stance as diff-raw-numstat).
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
// against native git), not the ambiguous-argument form it uses without the
// separator.
import { definePath, expandDiffRev, fail, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-numstat-no-color-minimal-separator",
	summary: "numstat for the no-color/minimal cluster with -- separator via arc diff --git",
	spec:
		"diff (-M|--find-renames) --no-color --no-ext-diff? --no-textconv? --minimal --src-prefix=<src> --dst-prefix=<dst>? --numstat -z? <rev>? -- <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.rev) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return fail(128, `fatal: bad revision '${args.pos.rev}'\n`)
			arcArgs.push(...t)
		}
		if (args.list.paths?.length) arcArgs.push("--", ...args.list.paths)
		// a rev-anchored diff is cwd-independent → arcRoot; the bare diff is
		// index-vs-worktree and must run at the invocation cwd
		const r = await ctx.arc(arcArgs, args.pos.rev ? { cwd: ctx.arcRoot } : undefined)
		if (r.code !== 0) {
			return args.pos.rev ? fail(128, `fatal: bad revision '${args.pos.rev}'\n`) : r
		}
		const rows = numstatFromUnified(r.stdout)
		// tabs survive -z; only the record terminator switches \n → NUL
		const term = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${term}`).join(""))
	},

	fixtures: [
		{
			name: "lone rev hash, full flag cluster, NUL-terminated rows",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z",
				"6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5", "--",
			],
			arcReplies: {
				"merge-base 6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5 HEAD": { stdout: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6\n" },
				"diff --git 7a8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6": {
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
				"--src-prefix=a/", "--numstat", "trunk..HEAD", "--",
			],
			arcReplies: {
				"diff --git trunk HEAD": {
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
			name: "three-dot range, origin alias resolved",
			argv: [
				"diff", "-M", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--numstat", "origin/trunk...HEAD", "--",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7\n" },
				"diff --git 8b9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7 HEAD": {
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
				"--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z",
				"HEAD", "--", "dir/sub/file.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b\n" },
				"diff --git 9c0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b -- dir/sub/file.txt": {
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
				"--src-prefix=a/", "--dst-prefix=b/", "--numstat", "--",
			],
			arcReplies: {
				"diff --git": {
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
				"--src-prefix=a/", "--numstat", "-z", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b9c\n" },
				"diff --git 0d1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b9c": {
					stdout: "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n",
				},
			},
			want: { stdout: "-\t-\tassets/logo.png\0", code: 0 },
		},
		{
			name: "empty diff",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--numstat", "-z", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b9c0d\n" },
				"diff --git 1e2f3a4b5c6d7e8f9a0b1a2b3c4d5e6f7a8b9c0d": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "unknown rev: git's bad-revision fatal (with -- separator)",
			argv: [
				"diff", "--find-renames", "--no-color", "--minimal",
				"--src-prefix=a/", "--numstat", "nosuchrev", "--",
			],
			arcReplies: {
				"merge-base nosuchrev HEAD": { stderr: "Error: unknown revision\n", code: 1 },
				"diff --git nosuchrev": { stderr: "Error: unknown revision\n", code: 1 },
			},
			want: { stdout: "", stderr: "fatal: bad revision 'nosuchrev'\n", code: 128 },
		},
	],
})
