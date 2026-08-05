// git diff --patch --no-color [--no-ext-diff] [--no-textconv] --minimal
//   --ignore-all-space [<rev>] -- [<path>...]
// Same semantics as diff-patch-minimal-ignore-all-space but with three extra
// no-op flags that agents commonly pass: --no-color (arc diff --git is already
// uncolored), --no-ext-diff (arc never uses external diff drivers), --no-textconv
// (arc has no textconv concept). --no-color is declared REQUIRED so this path
// does not overlap with diff-patch-minimal-ignore-all-space (specificity 5 vs 4);
// --no-ext-diff and --no-textconv are optional. --patch is the default unified-diff
// format (arc diff --git already emits it); --minimal is a diff-algorithm knob arc
// has no equivalent for — dropped. --ignore-all-space maps 1:1 to arc's -w. The
// lone <rev> gets the same merge-base worktree lens as diff-prose (trunk drifts,
// so a literal `git diff trunk` would drown the caller's changes); paths after
// `--` pass through as arc diff path filters.
import { definePath, expandDiffRev, isExecResult } from "../core"

export default definePath({
	name: "diff-patch-no-color-minimal-ignore-all-space",
	summary: "patch diff ignoring whitespace with no-op color/ext-diff/textconv flags via arc diff --git -w",
	spec: "diff --patch --no-color --no-ext-diff? --no-textconv? --minimal --ignore-all-space <rev>? -- <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git", "-w"]
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		for (const p of args.list.paths ?? []) arcArgs.push(p)
		const r = await ctx.arc(arcArgs)
		return r
	},

	fixtures: [
		{
			name: "HEAD clean working tree with all no-op flags",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git -w abc123def456": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "HEAD with changes, whitespace ignored",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git -w abc123def456": {
					stdout:
						"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context\n",
				},
			},
			want: {
				stdout:
					"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context\n",
				code: 0,
			},
		},
		{
			name: "HEAD with pathspec filter",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "HEAD", "--", "dir/sub/file.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git -w abc123def456 dir/sub/file.txt": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1 +1 @@\n-x\n+y\n",
				},
			},
			want: {
				stdout:
					"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1 +1 @@\n-x\n+y\n",
				code: 0,
			},
		},
		{
			name: "only --no-color required flag, no optional no-op flags",
			argv: [
				"diff", "--patch", "--no-color", "--minimal", "--ignore-all-space",
				"HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git -w abc123def456": {
					stdout:
						"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-a\n+b\n",
				},
			},
			want: {
				stdout:
					"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-a\n+b\n",
				code: 0,
			},
		},
		{
			name: "trunk rev uses merge-base lens",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "trunk", "--",
			],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "mb0987654321\n" },
				"diff --git -w mb0987654321": {
					stdout:
						"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-a\n+b\n",
				},
			},
			want: {
				stdout:
					"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-a\n+b\n",
				code: 0,
			},
		},
		{
			name: "no rev, just separator",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "--",
			],
			arcReplies: {
				"diff --git -w": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
