// git diff --quiet [<rev>] — the script/CI probe shape: print NOTHING,
// exit 1 if there are differences, 0 if not (--quiet implies --exit-code;
// real git emits zero bytes on both stdout and stderr in either case —
// verified against native git, clean and dirty). No existing diff path
// declares --quiet, so this shape fell through to learning.
// Differences are detected by asking arc for the same diff and testing for
// a non-empty body: bare (no rev) is index-vs-worktree, which is exactly
// what plain `arc diff` computes ("see changes relative to the index");
// a lone rev goes through expandDiffRev's merge-base worktree lens, like
// every other rev-vs-worktree diff in the shim (trunk drifts underneath a
// literal rev, so HEAD's own changes would drown the caller's probe).
import { badRevision, definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-quiet",
	summary: "silent exit-code-only diff probe (1 = differences)",
	spec: "diff --quiet <rev>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--git"]
		if (args.pos.rev) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		// bare diff is index-relative, so it must run at the invocation cwd;
		// a hash-anchored diff is cwd-independent but arcRoot is the
		// convention the other rev-diff paths use.
		const r = await ctx.arc(arcArgs, args.pos.rev ? { cwd: ctx.arcRoot } : undefined)
		if (r.code !== 0) return args.pos.rev ? badRevision(args.pos.rev) : r
		return r.stdout.trim() === "" ? ok() : { stdout: "", stderr: "", code: 1 }
	},

	fixtures: [
		{
			name: "HEAD, no differences: silent exit 0",
			argv: ["diff", "--quiet", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": { stdout: "" },
			},
			want: { stdout: "", stderr: "", code: 0 },
		},
		{
			name: "HEAD, differences: silent exit 1",
			argv: ["diff", "--quiet", "HEAD"],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\n" },
				"diff --git a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2": {
					stdout: "diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n--- a/dir/sub/file.txt\n+++ b/dir/sub/file.txt\n@@ -1 +1 @@\n-old\n+new\n",
				},
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "bare: unstaged worktree change, silent exit 1",
			argv: ["diff", "--quiet"],
			arcReplies: {
				"diff --git": {
					stdout: "diff --git a/code/mod.go b/code/mod.go\n--- a/code/mod.go\n+++ b/code/mod.go\n@@ -1 +1 @@\n-x\n+y\n",
				},
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "bare: worktree matches index, silent exit 0",
			argv: ["diff", "--quiet"],
			arcReplies: { "diff --git": { stdout: "" } },
			want: { stdout: "", stderr: "", code: 0 },
		},
		{
			name: "trunk rev uses merge-base lens",
			argv: ["diff", "--quiet", "trunk"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git c79064cbea91ca389afe153a347d588452fe50df": { stdout: "" },
			},
			want: { stdout: "", stderr: "", code: 0 },
		},
		{
			name: "unknown revision: git-shaped 128 fatal",
			argv: ["diff", "--quiet", "nosuchrev"],
			arcReplies: {
				"merge-base nosuchrev HEAD": { stderr: "Error: unknown revision\n", code: 1 },
				"diff --git nosuchrev": { stderr: "Error: unknown revision\n", code: 1 },
			},
			want: {
				stderr:
					`fatal: ambiguous argument 'nosuchrev': unknown revision or path not in the working tree.\n` +
					`Use '--' to separate paths from revisions, like this:\n` +
					`'git <command> [<revision>...] -- [<file>...]'\n`,
				code: 128,
			},
		},
	],
})
