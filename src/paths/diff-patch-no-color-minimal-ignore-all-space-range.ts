// git diff --patch --no-color [--no-ext-diff] [--no-textconv] --minimal
//   --ignore-all-space <range>
// A rev range (e.g. origin/trunk...HEAD) WITHOUT a "--" separator, carrying
// the three no-op flags agents commonly pass alongside --no-color. The
// existing diff-patch-no-color-minimal-ignore-all-space path requires "--"
// (it ends with <rev>? -- <paths...>?), and diff-patch-minimal-ignore-all-space-
// range does not declare --no-color/--no-ext-diff/--no-textconv, so this shape
// fell through to learning.
// --patch is the default unified-diff format (arc diff --git already emits it);
// --minimal is a diff-algorithm knob arc has no equivalent for — dropped (the
// output shape is identical, only the chosen hunks may differ). --no-color is
// a no-op (arc diff --git is already uncolored), declared REQUIRED so this path
// does not overlap with diff-patch-minimal-ignore-all-space-range (specificity
// 5 vs 4); --no-ext-diff (arc never uses external diff drivers) and --no-textconv
// (arc has no textconv concept) are optional no-ops. --ignore-all-space maps
// 1:1 to arc's -w. Range endpoints are normalized with arcRev so
// "origin/trunk" → "arcadia/trunk" before hitting arc merge-base; expandDiffRev
// then does the triple-dot merge-base lens or double-dot open-ends expansion.
import { definePath, expandDiffRev, isExecResult } from "../core"

export default definePath({
	name: "diff-patch-no-color-minimal-ignore-all-space-range",
	summary: "patch diff ignoring whitespace with no-op color/ext-diff/textconv flags over a rev range via arc diff --git -w",
	spec: "diff --patch --no-color --no-ext-diff? --no-textconv? --minimal --ignore-all-space <range>",

	async run(args, ctx) {
		// expandDiffRev arcRevs the endpoints itself
		const t = await expandDiffRev(ctx, args.pos.range!, true)
		if (isExecResult(t)) return t
		return ctx.arc(["diff", "--git", "-w", ...t])
	},

	fixtures: [
		{
			name: "triple-dot range origin/trunk...HEAD with all no-op flags",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "mb0987654321\n" },
				"diff --git -w mb0987654321 HEAD": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context\n",
				},
			},
			want: {
				stdout:
					"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context\n",
				code: 0,
			},
		},
		{
			name: "double-dot range trunk..HEAD",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "trunk..HEAD",
			],
			arcReplies: {
				"diff --git -w trunk HEAD": {
					stdout: "diff --git a/x.go b/x.go\n--- a/x.go\n+++ b/x.go\n@@ -1 +1 @@\n-p\n+q\n",
				},
			},
			want: {
				stdout: "diff --git a/x.go b/x.go\n--- a/x.go\n+++ b/x.go\n@@ -1 +1 @@\n-p\n+q\n",
				code: 0,
			},
		},
		{
			name: "only --no-color required, no optional no-op flags",
			argv: [
				"diff", "--patch", "--no-color", "--minimal", "--ignore-all-space",
				"origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "mb0987654321\n" },
				"diff --git -w mb0987654321 HEAD": {
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
			name: "bad revision in range passes arc error through",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv",
				"--minimal", "--ignore-all-space", "origin/nonexistent...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/nonexistent HEAD": {
					stdout: "",
					stderr: "error: unknown reference 'arcadia/nonexistent'\n",
					code: 1,
				},
			},
			want: { stdout: "", stderr: "error: unknown reference 'arcadia/nonexistent'\n", code: 1 },
		},
	],
})
