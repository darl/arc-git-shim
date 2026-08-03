// git diff --no-ext-diff (--cached|--staged) (--patch|-p|-u) --minimal
// Shows staged (index-vs-HEAD) changes in unified-patch format.
// --no-ext-diff disables external diff drivers — arc has no such concept, so
// it's a no-op. --patch/-p/-u is the default unified-diff format that
// `arc diff --git` already emits. --minimal is a diff-algorithm knob arc has
// no equivalent for — dropped (the output shape is identical, only the chosen
// hunks may differ). Net mapping: `arc diff --git --cached`.
import { definePath } from "../core"

export default definePath({
	name: "diff-no-ext-diff-cached-patch-minimal",
	summary: "staged patch diff via arc diff --git --cached",
	spec: "diff --no-ext-diff (--cached|--staged) (--patch|-p|-u) --minimal",

	async run(_args, ctx) {
		const r = await ctx.arc(["diff", "--git", "--cached"])
		return r
	},

	fixtures: [
		{
			name: "staged changes present",
			argv: ["diff", "--no-ext-diff", "--cached", "--patch", "--minimal"],
			arcReplies: {
				"diff --git --cached": {
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
			name: "no staged changes",
			argv: ["diff", "--no-ext-diff", "--cached", "--patch", "--minimal"],
			arcReplies: {
				"diff --git --cached": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "--staged alias",
			argv: ["diff", "--no-ext-diff", "--staged", "--patch", "--minimal"],
			arcReplies: {
				"diff --git --cached": {
					stdout:
						"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-x\n+y\n",
				},
			},
			want: {
				stdout:
					"diff --git a/bar.go b/bar.go\n--- a/bar.go\n+++ b/bar.go\n@@ -1 +1 @@\n-x\n+y\n",
				code: 0,
			},
		},
		{
			name: "-p alias for --patch",
			argv: ["diff", "--no-ext-diff", "--cached", "-p", "--minimal"],
			arcReplies: {
				"diff --git --cached": {
					stdout:
						"diff --git a/baz.go b/baz.go\n--- a/baz.go\n+++ b/baz.go\n@@ -2 +2 @@\n-old\n+new\n",
				},
			},
			want: {
				stdout:
					"diff --git a/baz.go b/baz.go\n--- a/baz.go\n+++ b/baz.go\n@@ -2 +2 @@\n-old\n+new\n",
				code: 0,
			},
		},
		{
			name: "-u alias for --patch",
			argv: ["diff", "--no-ext-diff", "--cached", "-u", "--minimal"],
			arcReplies: {
				"diff --git --cached": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
