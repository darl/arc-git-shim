// git diff [-M|--find-renames] --no-color [--no-ext-diff] [--no-textconv]
//   --minimal --src-prefix=<x> [--dst-prefix=<y>] --ignore-all-space
//   --patch <rev>? -- <paths...>?
//
// The flag-cluster of diff-patch-prefix-ignore-all-space plus the rename
// switch: -M/--find-renames is REQUIRED here so the matching sets stay
// disjoint (that path does not declare -M; without it the argv falls to it
// or to learning). Like every other -M/--find-renames declaration in the
// diff family, the switch is accepted and dropped — arc's rename detection
// degrades to A+D pairs in `arc diff --git`, but the patch structure stays
// valid. The rest is the sibling's contract unchanged: --no-color/
// --no-ext-diff/--no-textconv/--minimal are no-ops, --ignore-all-space →
// arc -w, and arc diff --git's fixed a/ b/ headers are rewritten to the
// caller's prefixes when they differ (null sources stay "/dev/null";
// default a/ b/ is a byte-exact passthrough). The lone <rev> gets the
// merge-base worktree lens via expandDiffRev — trunk drifts, so a literal
// `git diff trunk` would drown the caller's changes — and paths after `--`
// pass through as arc diff path filters.
import { definePath, expandDiffRev, isExecResult, ok, type ExecResult } from "../core"

/** Rewrite arc's fixed a/ b/ diff headers to the caller's prefixes. Header
 * lines are only rewritten in the per-file header block (between the
 * "diff --git" line and the +++ line), mirroring how the shared
 * numstatFromUnified walks a unified diff; hunk body text is never touched. */
function rewritePrefixes(diff: string, src: string, dst: string): string {
	const out: string[] = []
	let inHeaders = false
	for (const line of diff.split("\n")) {
		if (line.startsWith("diff --git ")) {
			inHeaders = true
			out.push(line.replace(/^diff --git a\/(.*) b\/(.*)$/, (_m, o, c) => `diff --git ${src}${o} ${dst}${c}`))
		} else if (inHeaders && line.startsWith("--- ")) {
			// /dev/null (new file) has no source prefix, like real git
			out.push(line.replace(/^--- a\/(.*)$/, (_m, p) => `--- ${src}${p}`))
		} else if (inHeaders && line.startsWith("+++ ")) {
			out.push(line.replace(/^\+\+\+ b\/(.*)$/, (_m, p) => `+++ ${dst}${p}`))
			inHeaders = false
		} else if (inHeaders && line.startsWith("Binary files ")) {
			out.push(
				line.replace(/^Binary files a\/(.*) and b\/(.*) differ$/, (_m, o, c) => `Binary files ${src}${o} and ${dst}${c} differ`),
			)
		} else {
			out.push(line)
		}
	}
	return out.join("\n")
}

export default definePath({
	name: "diff-patch-find-renames-prefix-ignore-all-space",
	summary: "patch diff with rename switch, explicit src/dst prefixes and whitespace-ignoring via arc diff --git -w",
	spec:
		"diff (-M|--find-renames) --no-color --no-ext-diff? --no-textconv? --minimal --src-prefix=<src> --dst-prefix=<dst>? --ignore-all-space --patch <rev>? -- <paths...>?",

	async run(args, ctx) {
		const src = args.pos.src ?? "a/"
		const dst = args.pos.dst ?? "b/"
		const arcArgs = ["diff", "--git", "-w"]
		if (src !== "a/" || dst !== "b/") arcArgs.push(`--src-prefix=${src}`, `--dst-prefix=${dst}`)
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, true)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		for (const p of args.list.paths ?? []) arcArgs.push(p)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0 || (src === "a/" && dst === "b/")) return r as ExecResult
		return ok(rewritePrefixes(r.stdout, src, dst))
	},

	fixtures: [
		{
			name: "find-renames with default prefixes is a byte-exact passthrough",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--patch", "9f3c1d5e7a2b4c6d8e0f1a3b5c7d9e0f2a4b6c8d", "--",
			],
			arcReplies: {
				"merge-base 9f3c1d5e7a2b4c6d8e0f1a3b5c7d9e0f2a4b6c8d HEAD": {
					stdout: "9f3c1d5e7a2b4c6d8e0f1a3b5c7d9e0f2a4b6c8d\n",
				},
				"diff --git -w 9f3c1d5e7a2b4c6d8e0f1a3b5c7d9e0f2a4b6c8d": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"index 3d7e8f9..1a2b3c4 100644\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1,2 +1,3 @@\n" +
						" context\n" +
						"-more\n" +
						"+CHANGED \tmore   \n" +
						"+added\n",
				},
			},
			want: {
				stdout:
					"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
					"index 3d7e8f9..1a2b3c4 100644\n" +
					"--- a/dir/sub/file.txt\n" +
					"+++ b/dir/sub/file.txt\n" +
					"@@ -1,2 +1,3 @@\n" +
					" context\n" +
					"-more\n" +
					"+CHANGED \tmore   \n" +
					"+added\n",
				code: 0,
			},
		},
		{
			name: "short -M spelling with custom prefixes rewrites headers, /dev/null source stays unprefixed",
			argv: [
				"diff", "-M", "--no-color", "--minimal", "--src-prefix=w/",
				"--dst-prefix=c/", "--ignore-all-space", "--patch", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f\n" },
				"diff --git -w --src-prefix=w/ --dst-prefix=c/ 6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f": {
					stdout:
						"diff --git a/dir/sub/new.txt b/dir/sub/new.txt\n" +
						"new file mode 100644\n" +
						"--- /dev/null\n" +
						"+++ b/dir/sub/new.txt\n" +
						"@@ -0,0 +1 @@\n" +
						"+fresh\n" +
						"diff --git a/assets/img.png b/assets/img.png\n" +
						"Binary files a/assets/img.png and b/assets/img.png differ\n",
				},
			},
			want: {
				stdout:
					"diff --git w/dir/sub/new.txt c/dir/sub/new.txt\n" +
					"new file mode 100644\n" +
					"--- /dev/null\n" +
					"+++ c/dir/sub/new.txt\n" +
					"@@ -0,0 +1 @@\n" +
					"+fresh\n" +
					"diff --git w/assets/img.png c/assets/img.png\n" +
					"Binary files w/assets/img.png and c/assets/img.png differ\n",
				code: 0,
			},
		},
		{
			name: "trunk rev uses the merge-base lens under custom prefixes",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-textconv", "--minimal",
				"--src-prefix=o/", "--dst-prefix=n/", "--ignore-all-space", "--patch", "trunk", "--",
			],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --git -w --src-prefix=o/ --dst-prefix=n/ c79064cbea91ca389afe153a347d588452fe50df": {
					stdout:
						"diff --git a/code/mod.go b/code/mod.go\n" +
						"--- a/code/mod.go\n" +
						"+++ b/code/mod.go\n" +
						"@@ -1 +1 @@\n" +
						"-old\n" +
						"+new\n",
				},
			},
			want: {
				stdout:
					"diff --git o/code/mod.go n/code/mod.go\n" +
					"--- o/code/mod.go\n" +
					"+++ n/code/mod.go\n" +
					"@@ -1 +1 @@\n" +
					"-old\n" +
					"+new\n",
				code: 0,
			},
		},
		{
			name: "pathspec filter passes through to arc",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--patch", "HEAD", "--", "dir/sub/file.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f\n" },
				"diff --git -w 6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f dir/sub/file.txt": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1 +1 @@\n" +
						"-x\n" +
						"+y\n",
				},
			},
			want: {
				stdout:
					"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
					"--- a/dir/sub/file.txt\n" +
					"+++ b/dir/sub/file.txt\n" +
					"@@ -1 +1 @@\n" +
					"-x\n" +
					"+y\n",
				code: 0,
			},
		},
		{
			name: "empty diff",
			argv: [
				"diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--patch", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f\n" },
				"diff --git -w 6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "arc failure propagates unwritten",
			argv: [
				"diff", "-M", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "--patch", "HEAD", "--", "gone.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f\n" },
				"diff --git -w 6e2f4a5b7c8d9e0f1a3b5c7d8e9f0a1b2c3d4e5f gone.txt": {
					stderr: "Error: diff failed\n",
					code: 1,
				},
			},
			want: { stderr: "Error: diff failed\n", code: 1 },
		},
	],
})
