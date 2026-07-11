// Prose-tier diff: plain / paths / --stat / --cached / -B / rev ranges.
// arc diff --git emits git-compatible unified diffs; passthrough.
// Range args: "a..b" splits to two revs; "a...b" (merge-base form) resolves
// the base via arc merge-base first. A lone arg containing ".." is treated as
// a range unless it starts with "." (heuristic — pathspecs with ".." inside
// are vanishingly rare from agents; documented v1 tradeoff).
import { definePath, ok } from "../core"

export default definePath({
	name: "diff-prose",
	summary: "unified diff / stat via arc diff --git passthrough",
	spec: "diff --stat? (--cached|--staged)? (-B|--base)? <args...>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.flags.has("--stat")) arcArgs.push("--stat")
		if (args.flags.has("--cached") || args.flags.has("--staged")) arcArgs.push("--cached")
		if (args.flags.has("-B") || args.flags.has("--base")) arcArgs.push("-B")
		for (const a of args.list.args ?? []) {
			const range = !a.startsWith(".") && a.includes("..")
			if (range && a.includes("...")) {
				const [x, y] = a.split("...")
				const mb = await ctx.arc(["merge-base", x!, y!])
				if (mb.code !== 0) return mb
				arcArgs.push(mb.stdout.trim(), y!)
			} else if (range) {
				const [x, y] = a.split("..")
				arcArgs.push(x!, y!)
			} else arcArgs.push(a)
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
