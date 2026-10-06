// git diff-index <tree> -- compares the tree to the WORKING TREE (probed in
// real git: `git diff-index -M --numstat HEAD --` prints exactly what
// `git diff --numstat HEAD` prints — staged + unstaged changes; only with
// --cached does it collapse to the index-only view, i.e. `git diff --cached`).
// arc has no diff-index and no --numstat; the shim reuses the diff-numstat
// strategy: one arc diff --git (or --cached --git) unified diff, counted
// with numstatFromUnified (binary → "-\t-\tpath", like git).
// Without --cached the lone tree goes through the working-tree lens —
// merge-base(tree, HEAD) — see expandDiffRev (a literal trunk would drown
// the caller's changes in fresh trunk commits); with --cached the tree is
// pinned directly, matching diff-cached-numstat.
// -M/-C accepted and dropped (arc rename detection degrades to A+D pairs;
// structure stays valid). --staged is not in diff-index's synopsis — only
// --cached is, so only --cached is declared.
import { definePath, expandDiffRev, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-index-numstat",
	summary: "diff-index --numstat computed from one arc diff --git call",
	spec: "diff-index -z? --cached? (-M|--find-renames)? (-C|--find-copies)? --numstat <tree> -- <paths...>?",

	async run(args, ctx) {
		const cached = args.flags.has("--cached")
		const arcArgs = cached ? ["diff", "--cached", "--git"] : ["diff", "--git"]
		const t = await expandDiffRev(ctx, args.pos.tree!, !cached)
		if (isExecResult(t)) return t
		arcArgs.push(...t)
		if (args.list.paths?.length) arcArgs.push("--", ...args.list.paths)

		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const rows = numstatFromUnified(r.stdout)
		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${sep}`).join(""))
	},

	fixtures: [
		{
			name: "tree vs working tree, trailing bare --",
			argv: ["diff-index", "-M", "--numstat", "HEAD", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a\n" },
				"diff --git 3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a": {
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
						"--- a/dir/sub/file2.txt\n" +
						"+++ b/dir/sub/file2.txt\n" +
						"@@ -1 +1 @@\n" +
						"-old\n" +
						"+new\n",
				},
			},
			want: { stdout: "2\t1\tdir/sub/file1.txt\n1\t1\tdir/sub/file2.txt\n", code: 0 },
		},
		{
			name: "pathspecs after -- forwarded",
			argv: ["diff-index", "--numstat", "HEAD", "--", "dir/sub/file1.txt"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a\n" },
				"diff --git 3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a -- dir/sub/file1.txt": {
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
			want: { stdout: "2\t1\tdir/sub/file1.txt\n", code: 0 },
		},
		{
			name: "--cached pins the tree (index view)",
			argv: ["diff-index", "--cached", "--numstat", "HEAD", "--"],
			arcReplies: {
				"diff --cached --git HEAD": {
					stdout:
						"diff --git a/dir/sub/staged.txt b/dir/sub/staged.txt\n" +
						"--- a/dir/sub/staged.txt\n" +
						"+++ b/dir/sub/staged.txt\n" +
						"@@ -1 +1 @@\n" +
						"-old\n" +
						"+new\n",
				},
			},
			want: { stdout: "1\t1\tdir/sub/staged.txt\n", code: 0 },
		},
		{
			name: "binary dashes, NUL-terminated (-z)",
			argv: ["diff-index", "-z", "-M", "--numstat", "abc123", "--"],
			arcReplies: {
				"merge-base abc123 HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout:
						"diff --git a/dir/sub/img.png b/dir/sub/img.png\n" +
						"Binary files a/dir/sub/img.png and b/dir/sub/img.png differ\n",
				},
			},
			want: { stdout: "-\t-\tdir/sub/img.png\0", code: 0 },
		},
		{
			name: "empty diff",
			argv: ["diff-index", "--numstat", "HEAD", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a\n" },
				"diff --git 3f2a1c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
