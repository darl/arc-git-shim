// git log --oneline --cherry-mark --right-only A...B --
//
// --right-only limits output to commits on the right side of a symmetric
// range (B not in A); --cherry-mark prefixes each line with "=" if an
// equivalent (same patch) commit exists on the left side, "+" otherwise.
// --oneline renders one line per commit: "<mark> <short-hash> <subject>".
//
// Arc has no cherry-pick detection, so we compute patch-ids ourselves by
// hashing `arc diff --git <parent> <commit>` (whitespace-stripped, sorted —
// an approximation of git's patch-id).  BOUNDED, unlike git: enumeration is
// capped at COUNT_RANGE_CAP per side, and patch-ids are computed ONLY for
// commits whose subject line appears on both sides (cherry-picks keep
// subjects in practice; one arc diff per commit over a trunk-sized side is
// ruinous — see the COUNT_RANGE_CAP note in core.ts).  A reworded
// cherry-pick therefore shows "+" instead of "=" — the safe direction: a
// commit is shown as pending, never hidden as landed.
import { createHash } from "node:crypto"
import { arcJson, arcRev, COUNT_RANGE_CAP, type Ctx, definePath, fail, isExecResult, ok, SHORT_HASH_LEN } from "../core"

/** Hard cap on patch-id probes per side (degenerate repeated-subject case). */
const PATCH_ID_CAP = 100

async function mapChunked<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
	const out: R[] = []
	for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
	return out
}

interface ArcLogCommit {
	commit: string
	parents: string[]
	message: string
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
		const left = arcRev(leftRaw)
		const right = arcRev(rightRaw)

		const cap = ["-n", String(COUNT_RANGE_CAP)]
		// Right-side commits: in right but not in left  (=  git A..B)
		const rightCommits = await arcJson<ArcLogCommit[]>(ctx, ["log", "--json", ...cap, `${left}..${right}`])
		if (isExecResult(rightCommits)) return rightCommits

		// Nothing on the right → empty output (skip left-side work entirely)
		if (rightCommits.length === 0) return ok("")

		// Left-side commits: in left but not in right  (=  git B..A)
		const leftCommits = await arcJson<ArcLogCommit[]>(ctx, ["log", "--json", ...cap, `${right}..${left}`])
		if (isExecResult(leftCommits)) return leftCommits

		// Patch-ids only where a subject appears on both sides (see header)
		const firstLine = (m: string) => m.split("\n")[0]!
		const leftSubjects = new Set(leftCommits.map((c) => firstLine(c.message)))
		const rightSubjects = new Set(rightCommits.map((c) => firstLine(c.message)))
		const candidates = (side: ArcLogCommit[], other: Set<string>) =>
			side.filter((c) => c.parents?.[0] !== undefined && other.has(firstLine(c.message))).slice(0, PATCH_ID_CAP)
		const leftCand = candidates(leftCommits, rightSubjects)
		const rightCand = candidates(rightCommits, leftSubjects)
		const pid = (c: ArcLogCommit) => computePatchId(ctx, c.parents[0]!, c.commit)
		const leftPatchIds = new Set((await mapChunked(leftCand, 8, pid)).filter(Boolean))
		const rightPids = await mapChunked(rightCand, 8, pid)
		const rightPatchId = new Map(rightCand.map((c, i) => [c.commit, rightPids[i]!]))

		// Mark each right-side commit: "=" if equivalent on left, "+" otherwise
		const lines = rightCommits.map((c) => {
			const p = rightPatchId.get(c.commit)
			const mark = p && leftPatchIds.has(p) ? "=" : "+"
			return `${mark} ${c.commit.slice(0, SHORT_HASH_LEN)} ${firstLine(c.message)}`
		})
		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "one cherry-picked (=), one unique (+)",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json -n 1000 HEAD..arcadia/trunk": {
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
				"log --json -n 1000 arcadia/trunk..HEAD": {
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
				// b2's subject has no left-side counterpart → "+" with NO diff probe
			},
			want: { stdout: "+ b2b2b2b2b2b2 Add new feature\n= a1a1a1a1a1a1 Fix bug in parser\n", code: 0 },
		},
		{
			name: "no left-side commits — all unique (+)",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json -n 1000 HEAD..arcadia/trunk": {
					stdout: JSON.stringify([
						{
							commit: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4",
							parents: ["f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3"],
							message: "Standalone commit",
						},
					]),
				},
				// empty left side → no subjects match → no diff probes at all
				"log --json -n 1000 arcadia/trunk..HEAD": { stdout: "[]" },
			},
			want: { stdout: "+ d4d4d4d4d4d4 Standalone commit\n", code: 0 },
		},
		{
			name: "empty right side — no output",
			argv: ["log", "--oneline", "--cherry-mark", "--right-only", "HEAD...arcadia/trunk", "--"],
			arcReplies: {
				"log --json -n 1000 HEAD..arcadia/trunk": { stdout: "[]" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
