// git diff <rev> --numstat [-- <paths>...] → "added\tdeleted\tpath" per file.
// This shape has the rev BEFORE --numstat and a literal `--` separator (e.g.
// `git diff HEAD --numstat --`), which the existing diff-numstat path does
// not declare (its spec puts --numstat first with no separator). Same
// numstat-from-unified-diff strategy: arc diff --git emits a git-compatible
// unified diff; the shim counts +/- lines per file (binary → "-\t-\tpath").
// The lone <rev> gets the merge-base worktree lens via expandDiffRev (trunk
// drifts, so a literal `git diff trunk` would drown the caller's changes).
import { definePath, expandDiffRev, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-rev-numstat-separator",
	summary: "numstat for rev-vs-worktree diff with -- separator",
	spec: "diff -z? <rev> --numstat (-M|--find-renames)? (-C|--find-copies)? -- <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		const t = await expandDiffRev(ctx, args.pos.rev!, true)
		if (isExecResult(t)) return t
		arcArgs.push(...t)
		for (const p of args.list.paths ?? []) arcArgs.push(p)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const rows = numstatFromUnified(r.stdout)
		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${sep}`).join(""))
	},

	fixtures: [
		{
			name: "HEAD numstat with separator",
			argv: ["diff", "HEAD", "--numstat", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1,3 +1,4 @@\n+added line\n context\n-removed line\n+changed\n",
				},
			},
			want: { stdout: "2\t1\tdir/sub/file.txt\n", code: 0 },
		},
		{
			name: "trunk uses merge-base lens",
			argv: ["diff", "trunk", "--numstat", "--"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git c79064cbea91ca389afe153a347d588452fe50df": {
					stdout: "diff --git a/code/mod.go b/code/mod.go\n--- a/code/mod.go\n+++ b/code/mod.go\n@@ -1 +1 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "1\t1\tcode/mod.go\n", code: 0 },
		},
		{
			name: "with pathspec filter after separator",
			argv: ["diff", "HEAD", "--numstat", "--", "dir/sub/file.txt"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 dir/sub/file.txt": {
					stdout: "diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1 +1,2 @@\n+new\n",
				},
			},
			want: { stdout: "1\t0\tdir/sub/file.txt\n", code: 0 },
		},
		{
			name: "binary file dashes",
			argv: ["diff", "HEAD", "--numstat", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout: "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n",
				},
			},
			want: { stdout: "-\t-\tassets/logo.png\n", code: 0 },
		},
		{
			name: "multiple files",
			argv: ["diff", "HEAD", "--numstat", "-M", "-C", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout:
						"diff --git a/a.go b/a.go\n--- a/a.go\n+++ b/a.go\n@@ -1 +1,2 @@\n+x\n" +
						"diff --git a/b.go b/b.go\n--- a/b.go\n+++ b/b.go\n@@ -1 +1 @@\n-y\n+z\n",
				},
			},
			want: { stdout: "1\t0\ta.go\n1\t1\tb.go\n", code: 0 },
		},
		{
			name: "NUL-delimited output",
			argv: ["diff", "-z", "HEAD", "--numstat", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout:
						"diff --git a/a.go b/a.go\n--- a/a.go\n+++ b/a.go\n@@ -1 +1,2 @@\n+x\n" +
						"diff --git a/b.go b/b.go\n--- a/b.go\n+++ b/b.go\n@@ -1 +1 @@\n-y\n+z\n",
				},
			},
			want: { stdout: "1\t0\ta.go\x001\t1\tb.go\x00", code: 0 },
		},
		{
			name: "empty diff",
			argv: ["diff", "HEAD", "--numstat", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
