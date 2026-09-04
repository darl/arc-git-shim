// git diff --patch --no-color --no-ext-diff --no-textconv --minimal
//   --src-prefix=<x> --dst-prefix=<y> --ignore-all-space <rev>? -- <paths...>?
//
// The flag-cluster of diff-patch-no-color-minimal-ignore-all-space (no-op
// --no-color/--no-ext-diff/--no-textconv/--minimal, --ignore-all-space → arc
// -w) plus explicit --src-prefix/--dst-prefix prefix overrides. arc diff
// --git always emits a/ and b/ headers; when the caller asks for different
// prefixes the shim rewrites arc's fixed a/ b/ header lines (and the
// "Binary files … differ" line) to the requested ones, byte-shaped like
// real git: null sources stay "/dev/null", only the destination prefix is
// applied there. Default a/ b/ is a byte-exact passthrough.
//
// --src-prefix is REQUIRED so this path cannot tie with
// diff-patch-no-color-minimal-ignore-all-space (same 4 required flags — an
// equal-specificity match on its fixtures would be a codegen-time
// ambiguity); shapes with only --dst-prefix keep falling through to learning.
// The lone <rev> gets the same merge-base worktree lens as the rest of the
// diff family (trunk drifts, so a literal `git diff trunk` would drown the
// caller's changes); paths after `--` pass through as arc diff path filters.
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
	name: "diff-patch-prefix-ignore-all-space",
	summary: "patch diff with explicit src/dst prefixes and whitespace-ignoring via arc diff --git -w",
	spec:
		"diff --patch --no-color --no-ext-diff? --no-textconv? --minimal --src-prefix=<src> --dst-prefix=<dst>? --ignore-all-space <rev>? -- <paths...>?",

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
			name: "default prefixes explicit are a byte-exact passthrough",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"index 8b6f4a1..0cbb251 100644\n" +
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
					"index 8b6f4a1..0cbb251 100644\n" +
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
			name: "custom prefixes rewrite headers, /dev/null source stays unprefixed",
			argv: [
				"diff", "--patch", "--no-color", "--minimal", "--src-prefix=w/",
				"--dst-prefix=c/", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w --src-prefix=w/ --dst-prefix=c/ 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6": {
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
			name: "only --src-prefix given, dst stays b/",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--minimal",
				"--src-prefix=w/", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w --src-prefix=w/ --dst-prefix=b/ 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6": {
					stdout:
						"diff --git a/keep.txt b/keep.txt\n" +
						"--- a/keep.txt\n" +
						"+++ b/keep.txt\n" +
						"@@ -1 +1 @@\n" +
						"-old\n" +
						"+new\n",
				},
			},
			want: {
				stdout:
					"diff --git w/keep.txt b/keep.txt\n" +
					"--- w/keep.txt\n" +
					"+++ b/keep.txt\n" +
					"@@ -1 +1 @@\n" +
					"-old\n" +
					"+new\n",
				code: 0,
			},
		},
		{
			name: "trunk rev uses the merge-base lens under custom prefixes",
			argv: [
				"diff", "--patch", "--no-color", "--no-textconv", "--minimal",
				"--src-prefix=o/", "--dst-prefix=n/", "--ignore-all-space", "trunk", "--",
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
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "HEAD", "--", "dir/sub/file.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6 dir/sub/file.txt": {
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
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "HEAD", "--",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "arc failure propagates unwritten",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "HEAD", "--", "gone.txt",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6\n" },
				"diff --git -w 5f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6 gone.txt": {
					stderr: "Error: diff failed\n",
					code: 1,
				},
			},
			want: { stderr: "Error: diff failed\n", code: 1 },
		},
	],
})
