// git for-each-ref --format=%(upstream:remotename) refs/heads/users/darl/feature-x
//
// %(upstream:remotename) yields the remote NAME of a local branch's upstream
// (e.g. "origin" in git).  In arc the only remote is "arcadia", so the answer
// is "arcadia" when an upstream is set, or "" when it isn't.  Remote-tracking
// refs never have upstreams — they ARE the upstream — so they always render "".
//
// Upstream info comes from `arc branch -a -vv --json`: the `-vv` flag adds a
// `remote` field to local-branch entries (e.g. "arcadia/trunk").  The full
// %(upstream:*) family is supported since they all derive from that one field:
//   %(upstream)             → refs/remotes/<remote>  (full refname)
//   %(upstream:short)       → <remote>               (arc's `remote` field as-is)
//   %(upstream:remotename)  → first path component   ("arcadia")
//   %(upstream:remoteref)   → refs/heads/<branch>    (refname within the remote)
// Basic placeholders %(HEAD) %(refname) %(refname:short) are also accepted so
// mixed formats work; %XX byte escapes are handled by renderRef.
//
// Collision avoidance: spec specificity is 2 (one required value-flag
// --format), same as for-each-ref-heads and for-each-ref-remotes.  Mutual
// exclusion via refine:
//   • Existing paths' BASIC_PLACEHOLDERS set excludes upstream:* → they
//     REJECT any format containing %(upstream:…) → hand off to us.
//   • Our refine REQUIRES %(upstream in the format → we REJECT basic-only
//     formats → we never steal their fixtures.
//   • for-each-ref-committerdate requires %(committerdate:unix); its SUPPORTED
//     set excludes upstream:* so it rejects ours, and ours excludes
//     committerdate:unix so we reject theirs.
//   • for-each-ref-sorted requires --sort (specificity 3); our argv lacks it.
//   • for-each-ref-multi-pattern requires ≥2 patterns and basic format.
import { definePath, isExecResult, ok } from "../core"
import { byRefname, type BranchEntry, entryRefname, listBranches, refMatches, renderRef, renderable } from "../refs"

const SUPPORTED = /^(HEAD|refname|refname:short|upstream|upstream:short|upstream:remotename|upstream:remoteref)$/

/** BranchEntry with the optional `remote` field added by `arc branch -vv`. */
interface UpstreamEntry extends BranchEntry {
	remote?: string
}

export default definePath({
	name: "for-each-ref-upstream-remotename",
	summary: "for-each-ref with %(upstream:*) placeholders",
	spec: "for-each-ref --format=<fmt> <pattern>?",
	refine: (args) => /%\(upstream/.test(args.pos.fmt!) && renderable(args.pos.fmt!, SUPPORTED),

	async run(args, ctx) {
		const entries = await listBranches(ctx, "-a", "-vv")
		if (isExecResult(entries)) return entries
		let refs = (entries as UpstreamEntry[]).map((e) => {
			const refname = entryRefname(e)
			const upstreamShort = e.remote ?? ""
			const slashIdx = upstreamShort.indexOf("/")
			const remotename = upstreamShort && slashIdx !== -1 ? upstreamShort.slice(0, slashIdx) : upstreamShort
			const branchPart = slashIdx !== -1 ? upstreamShort.slice(slashIdx + 1) : ""
			return {
				refname,
				current: !!e.current,
				upstream: upstreamShort ? `refs/remotes/${upstreamShort}` : "",
				upstreamShort,
				"upstream:remotename": remotename,
				"upstream:remoteref": branchPart ? `refs/heads/${branchPart}` : "",
			}
		})
		if (args.pos.pattern !== undefined) refs = refs.filter((r) => refMatches(args.pos.pattern!, r.refname))
		refs.sort(byRefname)
		return ok(
			refs
				.map((r) =>
					renderRef(args.pos.fmt!, r.refname, r.current, {
						upstream: r.upstream,
						"upstream:short": r.upstreamShort,
						"upstream:remotename": r["upstream:remotename"],
						"upstream:remoteref": r["upstream:remoteref"],
					}) + "\n",
				)
				.join(""),
		)
	},

	fixtures: [
		{
			name: "branch with upstream returns remote name",
			argv: ["for-each-ref", "--format=%(upstream:remotename)", "refs/heads/users/darl/feature-x"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "users/darl/feature-x", current: true, remote: "arcadia/users/darl/feature-x" },
					]),
				},
			},
			want: { stdout: "arcadia\n", code: 0 },
		},
		{
			name: "branch without upstream returns empty line",
			argv: ["for-each-ref", "--format=%(upstream:remotename)", "refs/heads/users/darl/feature-x"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([{ local: true, name: "users/darl/feature-x", current: true }]),
				},
			},
			want: { stdout: "\n", code: 0 },
		},
		{
			name: "all heads: mixed upstream and no-upstream branches",
			argv: ["for-each-ref", "--format=%(upstream:remotename)", "refs/heads"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", remote: "arcadia/trunk" },
						{ local: true, name: "users/darl/feature-x", current: true },
					]),
				},
			},
			want: { stdout: "arcadia\n\n", code: 0 },
		},
		{
			name: "no pattern: heads and remotes, remote refs have no upstream",
			argv: ["for-each-ref", "--format=%(upstream:remotename)"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", remote: "arcadia/trunk" },
						{ local: true, name: "users/darl/feature-x", current: true },
						{ name: "arcadia/trunk" },
					]),
				},
			},
			want: { stdout: "arcadia\n\n\n", code: 0 },
		},
		{
			name: "mixed basic + upstream placeholder with tab separator",
			argv: [
				"for-each-ref",
				"--format=%(refname:short)%09%(upstream:remotename)",
				"refs/heads",
			],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", remote: "arcadia/trunk" },
						{ local: true, name: "users/darl/feature-x", current: true },
					]),
				},
			},
			want: { stdout: "trunk\tarcadia\nusers/darl/feature-x\t\n", code: 0 },
		},
		{
			name: "upstream short and full refname forms",
			argv: ["for-each-ref", "--format=%(upstream:short)%09%(upstream)", "refs/heads/trunk"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", remote: "arcadia/trunk" },
					]),
				},
			},
			want: { stdout: "arcadia/trunk\trefs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			name: "upstream remoteref for nested branch name",
			argv: ["for-each-ref", "--format=%(upstream:remoteref)", "refs/heads/users/darl/feature-x"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([
						{
							local: true,
							name: "users/darl/feature-x",
							current: true,
							remote: "arcadia/users/darl/feature-x",
						},
					]),
				},
			},
			want: { stdout: "refs/heads/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "no matching refs returns empty",
			argv: ["for-each-ref", "--format=%(upstream:remotename)", "refs/heads/nonexistent"],
			arcReplies: {
				"branch -a -vv --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk", remote: "arcadia/trunk" }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
