// git symbolic-ref [--quiet] [--short] refs/remotes/<remote>/HEAD
// In git, refs/remotes/origin/HEAD is a symbolic ref pointing to the default
// remote-tracking branch (e.g. refs/remotes/origin/master). Arc has no
// remote-tracking refs, but the only remote is arcadia (origin is an input
// alias) and its default branch is trunk. Real git answers under the remote
// you asked about, and callers parse with that prefix (t3code's
// resolveDefaultBranchName requires refs/remotes/<asked>/ verbatim), so the
// answer echoes the requested remote: origin → refs/remotes/origin/trunk.
// --quiet only suppresses error messages (there are none here since the ref
// is always symbolic in our emulation); --short strips the refs/remotes/
// prefix.
import { definePath, ok } from "../core"

const REMOTE_HEAD = /^refs\/remotes\/(arcadia|origin)\/HEAD$/

export default definePath({
	name: "symbolic-ref-remote-head",
	summary: "emulate refs/remotes/<remote>/HEAD → refs/remotes/<remote>/trunk",
	spec: "symbolic-ref (--quiet|-q)? --short? <ref>",
	refine: (args) => REMOTE_HEAD.test(args.pos.ref!),

	async run(args) {
		const remote = args.pos.ref!.match(REMOTE_HEAD)![1]!
		return ok(args.flags.has("--short") ? `${remote}/trunk\n` : `refs/remotes/${remote}/trunk\n`)
	},

	fixtures: [
		{
			name: "quiet origin HEAD",
			argv: ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
			arcReplies: {},
			want: { stdout: "refs/remotes/origin/trunk\n", code: 0 },
		},
		{
			name: "short origin HEAD",
			argv: ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
			arcReplies: {},
			want: { stdout: "origin/trunk\n", code: 0 },
		},
		{
			name: "plain arcadia HEAD",
			argv: ["symbolic-ref", "refs/remotes/arcadia/HEAD"],
			arcReplies: {},
			want: { stdout: "refs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			name: "short quiet arcadia HEAD",
			argv: ["symbolic-ref", "--quiet", "--short", "refs/remotes/arcadia/HEAD"],
			arcReplies: {},
			want: { stdout: "arcadia/trunk\n", code: 0 },
		},
	],
})
