// orca: diff [--cached|--staged] --numstat [-M] [-C] [-z] [<a> <b>].
// Same numstat-from-unified-diff strategy as diff-numstat, but against the
// staged index. arc diff --cached --git emits a git-compatible unified diff;
// the shim counts +/- lines per file (binary → "-\t-\tpath").
// -M/-C accepted and dropped (rename detection degrades to A+D pairs in arc;
// structure stays valid). Positionals (explicit revs) are passed through
// without the merge-base/working-tree lens — --cached already pins the base.
import { arcRev, definePath, expandDiffRev, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-cached-numstat",
	summary: "numstat for staged changes via arc diff --cached --git",
	spec: "diff -z? (--cached|--staged) --numstat (-M|--find-renames)? (-C|--find-copies)? <a>? <b>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--cached", "--git"]
		if (args.pos.a !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.a, false)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		if (args.pos.b !== undefined) arcArgs.push(arcRev(args.pos.b))
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const rows = numstatFromUnified(r.stdout)
		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${sep}`).join(""))
	},

	fixtures: [
		{
			name: "staged numstat from unified diff",
			argv: ["diff", "--cached", "--numstat", "-M"],
			arcReplies: {
				"diff --cached --git": {
					stdout:
						"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1,3 +1,4 @@\n+added line\n context\n-removed line\n+changed\n" +
						"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "2\t1\tfoo.go\n1\t1\tbar.go\n", code: 0 },
		},
		{
			name: "--staged alias",
			argv: ["diff", "--staged", "--numstat"],
			arcReplies: {
				"diff --cached --git": {
					stdout: "diff --git a/x.txt b/x.txt\n--- a/x.txt\n+++ b/x.txt\n@@ -1 +1 @@\n-a\n+b\n",
				},
			},
			want: { stdout: "1\t1\tx.txt\n", code: 0 },
		},
		{
			name: "binary file dashes",
			argv: ["diff", "--cached", "--numstat", "-M", "-C"],
			arcReplies: {
				"diff --cached --git": {
					stdout: "diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n",
				},
			},
			want: { stdout: "-\t-\timg.png\n", code: 0 },
		},
		{
			name: "NUL-delimited staged numstat",
			argv: ["diff", "-z", "--cached", "--numstat"],
			arcReplies: {
				"diff --cached --git": {
					stdout:
						"diff --git a/a.go b/a.go\n--- a/a.go\n+++ b/a.go\n@@ -1 +1,2 @@\n+x\n" +
						"diff --git a/b.go b/b.go\n--- a/b.go\n+++ b/b.go\n@@ -1 +1 @@\n-y\n+z\n",
				},
			},
			want: { stdout: "1\t0\ta.go\x001\t1\tb.go\x00", code: 0 },
		},
		{
			name: "staged numstat with explicit rev",
			argv: ["diff", "--cached", "--numstat", "HEAD~1"],
			arcReplies: {
				"diff --cached --git HEAD~1": {
					stdout: "diff --git a/c.go b/c.go\n--- a/c.go\n+++ b/c.go\n@@ -1 +1 @@\n-q\n+w\n",
				},
			},
			want: { stdout: "1\t1\tc.go\n", code: 0 },
		},
		{
			name: "empty staged diff",
			argv: ["diff", "--cached", "--numstat"],
			arcReplies: {
				"diff --cached --git": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
