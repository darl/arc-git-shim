// Prose-tier diff: plain / paths / --stat / --cached / -B / rev ranges.
// arc diff --git emits git-compatible unified diffs; passthrough.
// Rev args go through expandDiffRev: ranges split ("a...b" via merge-base),
// and a first lone arg diffs the working tree from merge-base(rev, HEAD) —
// pathspecs fail the merge-base probe and pass through literally. An arg
// containing ".." is treated as a range unless it starts with "." (heuristic —
// pathspecs with ".." inside are vanishingly rare from agents; v1 tradeoff).
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-prose",
	summary: "unified diff / stat via arc diff --git passthrough",
	spec: "diff --stat? (--cached|--staged)? (-B|--base)? <args...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.flags.has("--stat")) arcArgs.push("--stat")
		if (args.flags.has("--cached") || args.flags.has("--staged")) arcArgs.push("--cached")
		if (args.flags.has("-B") || args.flags.has("--base")) arcArgs.push("-B")
		// merge-base lens applies to the first arg only, and only for plain
		// worktree diffs (--cached/-B already diff against a computed base)
		let vsWorktree = !args.flags.has("--cached") && !args.flags.has("--staged") && !args.flags.has("-B") && !args.flags.has("--base")
		for (const a of args.list.args ?? []) {
			const t = await expandDiffRev(ctx, a, vsWorktree)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
			vsWorktree = false
		}
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "plain diff passthrough",
			argv: ["diff"],
			arcReplies: {
				"diff --git": { stdout: "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-x\n+y\n" },
			},
			want: { stdout: "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-x\n+y\n", code: 0 },
		},
		{
			name: "lone rev uses merge-base (trunk moves under you)",
			argv: ["diff", "trunk"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git c79064cbea91ca389afe153a347d588452fe50df": { stdout: "diff --git a/j b/j\n" },
			},
			want: { stdout: "diff --git a/j b/j\n", code: 0 },
		},
		{
			name: "lone pathspec passes through (merge-base probe fails)",
			argv: ["diff", "junk/darl/x.txt"],
			arcReplies: {
				"merge-base junk/darl/x.txt HEAD": { stderr: "Error: unknown revision\n", code: 1 },
				"diff --git junk/darl/x.txt": { stdout: "diff --git a/junk/darl/x.txt b/junk/darl/x.txt\n" },
			},
			want: { stdout: "diff --git a/junk/darl/x.txt b/junk/darl/x.txt\n", code: 0 },
		},
		{
			name: "range a..b splits",
			argv: ["diff", "trunk..HEAD"],
			arcReplies: {
				"diff --git trunk HEAD": { stdout: "diff --git a/g b/g\n" },
			},
			want: { stdout: "diff --git a/g b/g\n", code: 0 },
		},
		{
			name: "merge-base range a...b",
			argv: ["diff", "trunk...HEAD"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git c79064cbea91ca389afe153a347d588452fe50df HEAD": { stdout: "diff --git a/h b/h\n" },
			},
			want: { stdout: "diff --git a/h b/h\n", code: 0 },
		},
		{
			name: "diff -B (CLAUDE.md merge-base-vs-trunk idiom)",
			argv: ["diff", "-B"],
			arcReplies: {
				"diff --git -B": { stdout: "diff --git a/i b/i\n" },
			},
			want: { stdout: "diff --git a/i b/i\n", code: 0 },
		},
		{
			name: "staged diff with path",
			argv: ["diff", "--cached", "foo/bar.go"],
			arcReplies: {
				"diff --git --cached foo/bar.go": { stdout: "diff --git a/foo/bar.go b/foo/bar.go\n" },
			},
			want: { stdout: "diff --git a/foo/bar.go b/foo/bar.go\n", code: 0 },
		},
	],
})
