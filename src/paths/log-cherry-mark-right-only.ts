// git log --oneline --cherry-mark --right-only A...B --
//
// --right-only limits output to commits on the right side of a symmetric
// range (B not in A); --cherry-mark prefixes each line with "=" if an
// equivalent (same patch) commit exists on the left side, "+" otherwise.
// --oneline renders one line per commit: "<mark> <short-hash> <subject>".
//
// Arc has no cherry-pick detection, so we compute patch-ids ourselves:
// for every commit on BOTH sides we run `arc diff --git <parent> <commit>`
// and hash the whitespace-stripped, sorted diff lines (an approximation of
// git's patch-id that reliably identifies identical changes).  Right-side
// commits whose hash collides with any left-side hash get "=".
import { createHash } from "node:crypto"
import { arcJson, type Ctx, definePath, fail, isExecResult, ok, SHORT_HASH_LEN } from "../core"

interface ArcLogCommit {
	commit: string
	parents: string[]
	message: string
}

/** "origin/" is a silently-accepted alias for "arcadia/" (cross-cutting
 * remote contract); normalize so arc understands the ref. */
function normalizeRef(ref: string): string {
	return ref.replace(/^origin\//, "arcadia/")
}

/** Patch-id-like hash of a git-format diff.  Whitespace is stripped per
 * line and lines are sorted so re-ordered or whitespace-only-differing
 * equivalents hash identically.  Returns "" on failure (treated as unique). */
async function computePatchId(ctx: Ctx, parent: string, commit: string): Promise<string> {
	const r = await ctx.arc(["diff", "--git", parent, commit])
	if (r.code !== 0) return ""
	const normalized = r.stdout
		.split("\n")
		.map((l) => l.replace(/\s/g, ""))
		.filter((l) => l.length > 0)
		.sort()
		.join("")
	return createHash("sha1").update(normalized).digest("hex")
}

export default definePath({
	name: "log-cherry-mark-right-only",
	summary: "right-side commits of a symmetric range with cherry-pick detection",
	spec: "log --oneline --cherry-mark --right-only <range> --",
	refine: (args) => args.pos.range!.includes("..."),

	async run(args, ctx) {
		const range = args.pos.range!
		const [leftRaw, rightRaw] = range.split("...")
		if (!leftRaw || !rightRaw) return fail(128, `fatal: bad revision '${range}'\n`)
		const left = normalizeRef(leftRaw)
		const right = normalizeRef(rightRaw)

		// Right-side commits: in right but not in left  (=  git A..B)
		const rightCommits = await arcJson<ArcLogCommit[]>(ctx, ["log", "--json", `${left}..${right}`])
		if (isExecResult(rightCommits)) return rightCommits

		// Nothing on the right → empty output (skip left-side work entirely)
		if (rightCommits.length === 0) return ok("")

		// Left-side commits: in left but not in right  (=  git B..A)
		const leftCommits = await arcJson<ArcLogCommit[]>(ctx, ["log", "--json", `${right}..${left}`])
		if (isExecResult(leftCommits)) return leftCommits

		// Build patch-id set from left-side commits
		const leftPatchIds = new Set<string>()
		for (const c of leftCommits) {
			const parent = c.parents?.[0]
			if (parent) {
				const pid = await computePatchId(ctx, parent, c.commit)
				if (pid) leftPatchIds.add(pid)
			}
		}

		// Mark each right-side commit: "=" if equivalent on left, "+" otherwise
		const lines: string[] = []
		for (const c of rightCommits) {
			const parent = c.parents?.[0]
			let mark = "+"
			if (parent) {
				const pid = await computePatchId(ctx, parent, c.commit)
				if (pid && leftPatchIds.has(pid)) mark = "="
			}
			const shortHash = c.commit.slice(0, SHORT_HASH_LEN)
			const subject = c.message.split("\n")[0]!
			lines.push(`${mark} ${shortHash} ${subject}`)
		}

		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "one cherry-picked (=), one unique (+)",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json HEAD..arcadia/trunk": {
					stdout: JSON.stringify([
						{
							commit: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
							parents: ["f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1"],
							message: "Add new feature",
						},
						{
							commit: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
							parents: ["f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0"],
							message: "Fix bug in parser",
						},
					]),
				},
				"log --json arcadia/trunk..HEAD": {
					stdout: JSON.stringify([
						{
							commit: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
							parents: ["f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2"],
							message: "Fix bug in parser",
						},
					]),
				},
				// a1's diff == c3's diff (same patch) → "="
				"diff --git f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0 a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1": {
					stdout:
						"diff --git a/foo.txt b/foo.txt\n" +
						"--- a/foo.txt\n+++ b/foo.txt\n@@ -1,3 +1,3 @@\n line1\n-old\n+new\n line3\n",
				},
				"diff --git f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2 c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3": {
					stdout:
						"diff --git a/foo.txt b/foo.txt\n" +
						"--- a/foo.txt\n+++ b/foo.txt\n@@ -1,3 +1,3 @@\n line1\n-old\n+new\n line3\n",
				},
				// b2's diff is unique → "+"
				"diff --git f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1 b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2": {
					stdout:
						"diff --git a/bar.txt b/bar.txt\n" +
						"--- a/bar.txt\n+++ b/bar.txt\n@@ -1,3 +1,3 @@\n line1\n-x\n+y\n line3\n",
				},
			},
			want: { stdout: "+ b2b2b2b2b2b2 Add new feature\n= a1a1a1a1a1a1 Fix bug in parser\n", code: 0 },
		},
		{
			name: "no left-side commits — all unique (+)",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json HEAD..arcadia/trunk": {
					stdout: JSON.stringify([
						{
							commit: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
							parents: ["f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3"],
							message: "Standalone commit",
						},
					]),
				},
				"log --json arcadia/trunk..HEAD": { stdout: "[]" },
				"diff --git f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3 d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4": {
					stdout:
						"diff --git a/baz.txt b/baz.txt\n" +
						"--- a/baz.txt\n+++ b/baz.txt\n@@ -1,3 +1,3 @@\n line1\n-a\n+b\n line3\n",
				},
			},
			want: { stdout: "+ d4d4d4d4d4d4 Standalone commit\n", code: 0 },
		},
		{
			name: "empty right side — no output",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json HEAD..arcadia/trunk": { stdout: "[]" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
