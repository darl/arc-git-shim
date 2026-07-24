// git diff --patch --minimal [<rev>] -- [<path>...]
// --patch is the default unified-diff format (arc diff --git already emits it);
// --minimal is a diff-algorithm knob arc has no equivalent for — dropped (the
// output shape is identical, only the chosen hunks may differ). The lone <rev>
// gets the same merge-base worktree lens as diff-prose (trunk drifts, so a
// literal `git diff trunk` would drown the caller's changes); paths after `--`
// pass through as arc diff path filters.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-patch-minimal",
	summary: "patch diff via arc diff --git",
	// --no-ext-diff is a no-op (arc never uses external diff drivers); the
	// separator is optional — t3code's PR-range shape has none
	// (diff --no-ext-diff --patch --minimal <base>..HEAD)
	spec: "diff --no-ext-diff? --patch --minimal <rev>? --? <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		for (const p of args.list.paths ?? []) arcArgs.push(p)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "HEAD clean working tree",
			argv: ["diff", "--patch", "--minimal", "HEAD", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git abc123def456": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "HEAD with changes",
			argv: ["diff", "--patch", "--minimal", "HEAD", "--"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git abc123def456": {
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
			argv: ["diff", "--patch", "--minimal", "HEAD", "--", "foo.go"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "abc123def456\n" },
				"diff --git abc123def456 foo.go": {
					stdout:
						"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1 +1 @@\n-x\n+y\n",
				},
			},
			want: {
				stdout:
					"diff --git a/foo.go b/foo.go\n--- a/foo.go\n+++ b/foo.go\n@@ -1 +1 @@\n-x\n+y\n",
				code: 0,
			},
		},
		{
			name: "no rev, just separator",
			argv: ["diff", "--patch", "--minimal", "--"],
			arcReplies: {
				"diff --git": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "no-ext-diff range without separator (t3code PR range)",
			argv: ["diff", "--no-ext-diff", "--patch", "--minimal", "trunk..HEAD"],
			arcReplies: {
				"diff --git trunk HEAD": {
					stdout: "diff --git a/x.go b/x.go\n--- a/x.go\n+++ b/x.go\n@@ -1 +1 @@\n-p\n+q\n",
				},
			},
			want: {
				stdout: "diff --git a/x.go b/x.go\n--- a/x.go\n+++ b/x.go\n@@ -1 +1 @@\n-p\n+q\n",
				code: 0,
			},
		},
		{
			name: "trunk rev uses merge-base lens",
			argv: ["diff", "--patch", "--minimal", "trunk", "--"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "mb0987654321\n" },
				"diff --git mb0987654321": {
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
	],
})
