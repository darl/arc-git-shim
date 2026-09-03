// git diff --no-ext-diff --no-textconv --numstat [<rev>] → "added\tdel\tpath"
// per file. Codified tooling emits the diff-hygiene flag pair (no external
// diff drivers, no textconv — both no-ops here, arc has neither) with
// --numstat and a lone rev. Same strategy as the rest of the numstat family:
// arc diff --git emits a git-compatible unified diff; the shim counts +/- lines
// per file (binary files → "-\t-\tpath", like git). The lone rev gets the
// merge-base worktree lens via expandDiffRev — trunk drifts, so a literal
// `git diff trunk` would drown the caller's changes in fresh trunk commits.
//
// Spec requires AT LEAST ONE of --no-ext-diff/--no-textconv so the plain
// `diff --numstat <rev>` shape stays with diff-numstat (no specificity tie).
import { definePath, expandDiffRev, isExecResult, numstatFromUnified, ok } from "../core"

export default definePath({
	name: "diff-no-ext-diff-textconv-numstat",
	summary: "numstat for the --no-ext-diff/--no-textconv hygiene shape",
	spec: "diff -z? (--no-ext-diff|--no-textconv) --no-ext-diff? --no-textconv? --numstat <rev>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		const rows = numstatFromUnified(r.stdout)
		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(rows.map((x) => `${x.add}\t${x.del}\t${x.path}${sep}`).join(""))
	},

	fixtures: [
		{
			name: "HEAD numstat, both hygiene flags",
			argv: ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1,3 +1,4 @@\n+added line\n context\n-removed line\n+changed\n" +
						"diff --git a/dir/mod.go b/dir/mod.go\n--- a/dir/mod.go\n+++ b/dir/mod.go\n@@ -1 +1 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "2\t1\tdir/sub/file.txt\n1\t1\tdir/mod.go\n", code: 0 },
		},
		{
			name: "no rev: working-tree diff",
			argv: ["diff", "--no-ext-diff", "--no-textconv", "--numstat"],
			arcReplies: {
				"diff --git": {
					stdout: "diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1 +1,2 @@\n+new\n",
				},
			},
			want: { stdout: "1\t0\tdir/sub/file.txt\n", code: 0 },
		},
		{
			name: "trunk uses merge-base lens",
			argv: ["diff", "--no-ext-diff", "--numstat", "trunk"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git c79064cbea91ca389afe153a347d588452fe50df": {
					stdout: "diff --git a/code/mod.go b/code/mod.go\n--- a/code/mod.go\n+++ b/code/mod.go\n@@ -1 +1 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "1\t1\tcode/mod.go\n", code: 0 },
		},
		{
			name: "binary file dashes",
			argv: ["diff", "--no-textconv", "--numstat", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout: "diff --git a/assets/logo.png b/assets/logo.png\nBinary files a/assets/logo.png and b/assets/logo.png differ\n",
				},
			},
			want: { stdout: "-\t-\tassets/logo.png\n", code: 0 },
		},
		{
			name: "NUL-delimited rows with -z",
			argv: ["diff", "-z", "--no-ext-diff", "--no-textconv", "--numstat", "HEAD"],
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
			name: "empty diff prints nothing",
			argv: ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "arc diff failure passes through",
			argv: ["diff", "--no-ext-diff", "--no-textconv", "--numstat", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": { stdout: "", stderr: "Error: diff failed\n", code: 1 },
			},
			want: { stderr: "Error: diff failed\n", code: 1 },
		},
	],
})
