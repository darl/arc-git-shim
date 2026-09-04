// git diff --patch --no-color [--no-ext-diff] [--no-textconv] --minimal
//   --src-prefix=<x> --dst-prefix=<y> --ignore-all-space <range>
// The flag cluster of the no-color/minimal/ignore-all-space family plus
// explicit --src-prefix/--dst-prefix prefix overrides over a rev range,
// WITHOUT a trailing "--" separator. Two existing paths nearly cover this
// shape and each misses on one axis: diff-patch-prefix-ignore-all-space
// requires the literal "--" token (this argv has none), and
// diff-patch-no-color-minimal-ignore-all-space-range does not declare
// --src-prefix/--dst-prefix — so the shape fell through to learning.
//
// arc rejects --src-prefix/--dst-prefix outright ("unknown option"), and its
// diff --git output hardcodes a/ and b/ headers — so when the caller asks
// for non-default prefixes the shim rewrites arc's fixed header lines (the
// "diff --git" line, ---/+++ lines and the "Binary files … differ" line)
// byte-shaped like real git: null sources stay "/dev/null". Default a/ b/ is
// a byte-exact passthrough.
//
// --patch is the default unified-diff format (arc diff --git already emits
// it); --no-color/--no-ext-diff/--no-textconv are no-ops (arc diff --git is
// uncolored and has no external-diff/textconv concepts); --minimal is a
// diff-algorithm knob arc has no equivalent for — dropped (the output shape
// is identical, only the chosen hunks may differ). --ignore-all-space maps
// 1:1 to arc's -w. The rev-ish argument goes through expandDiffRev:
// "x...y" → merge-base(x,y) y, "x..y" → open ends, and a lone rev gets the
// worktree merge-base lens. Endpoints are arcRev'd, so "origin/trunk"
// resolves to "arcadia/trunk".
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
	name: "diff-patch-prefix-ignore-all-space-range",
	summary: "patch diff with explicit src/dst prefixes ignoring whitespace over a rev range via arc diff --git -w",
	spec:
		"diff --patch --no-color --no-ext-diff? --no-textconv? --minimal --src-prefix=<src> --dst-prefix=<dst>? --ignore-all-space <rev>",

	async run(args, ctx) {
		const src = args.pos.src ?? "a/"
		const dst = args.pos.dst ?? "b/"
		const arcArgs = ["diff", "--git", "-w"]
		// expandDiffRev arcRevs the endpoints itself
		const t = await expandDiffRev(ctx, args.pos.rev!, true)
		if (isExecResult(t)) return t
		arcArgs.push(...t)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0 || (src === "a/" && dst === "b/")) return r as ExecResult
		return ok(rewritePrefixes(r.stdout, src, dst))
	},

	fixtures: [
		{
			name: "triple-dot range with default prefixes is a byte-exact passthrough",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\n" },
				"diff --git -w a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 HEAD": {
					stdout:
						"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
						"index 8b6f4a1..0cbb251 100644\n" +
						"--- a/dir/sub/file.txt\n" +
						"+++ b/dir/sub/file.txt\n" +
						"@@ -1,2 +1,2 @@\n" +
						" context\n" +
						"-more\n" +
						"+CHANGED \tmore   \n",
				},
			},
			want: {
				stdout:
					"diff --git a/dir/sub/file.txt b/dir/sub/file.txt\n" +
					"index 8b6f4a1..0cbb251 100644\n" +
					"--- a/dir/sub/file.txt\n" +
					"+++ b/dir/sub/file.txt\n" +
					"@@ -1,2 +1,2 @@\n" +
					" context\n" +
					"-more\n" +
					"+CHANGED \tmore   \n",
				code: 0,
			},
		},
		{
			name: "custom prefixes rewrite headers; /dev/null source stays unprefixed",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=w/", "--dst-prefix=c/", "--ignore-all-space", "origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1\n" },
				"diff --git -w b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1 HEAD": {
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
				"diff", "--patch", "--no-color", "--minimal",
				"--src-prefix=w/", "--ignore-all-space", "origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2\n" },
				"diff --git -w c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2 HEAD": {
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
			name: "double-dot range expands open ends, no merge-base probe",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "trunk..HEAD",
			],
			arcReplies: {
				"diff --git -w trunk HEAD": {
					stdout: "diff --git a/code/mod.go b/code/mod.go\n--- a/code/mod.go\n+++ b/code/mod.go\n@@ -1 +1 @@\n-p\n+q\n",
				},
			},
			want: {
				stdout: "diff --git a/code/mod.go b/code/mod.go\n--- a/code/mod.go\n+++ b/code/mod.go\n@@ -1 +1 @@\n-p\n+q\n",
				code: 0,
			},
		},
		{
			name: "lone rev uses the merge-base worktree lens",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "HEAD",
			],
			arcReplies: {
				"merge-base HEAD HEAD": { stdout: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3\n" },
				"diff --git -w d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3": {
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
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "origin/trunk...HEAD",
			],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4\n" },
				"diff --git -w e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4 HEAD": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "merge-base failure propagates",
			argv: [
				"diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--minimal",
				"--src-prefix=a/", "--dst-prefix=b/", "--ignore-all-space", "origin/nonexistent...HEAD",
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
