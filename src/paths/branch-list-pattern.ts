// `git branch --list <pattern>...` — list local branches whose names match one
// or more shell glob patterns.  Same output shape as plain `git branch`:
// current branch starred, two-space indent otherwise, sorted alphabetically.
// The existing branch-list path (spec "branch (--list|-l)?") has no positional,
// so it only covers the no-pattern form; this path requires at least one
// pattern, keeping the two shapes cleanly disjoint.
import { arcJson, definePath, isExecResult, ok } from "../core"

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

/** Convert a shell glob to a case-sensitive, full-match RegExp.
 * Supports *, ?, and [...] character classes. */
function globToRegex(glob: string): RegExp {
	let re = ""
	for (let i = 0; i < glob.length; i++) {
		const ch = glob[i]!
		if (ch === "*") re += ".*"
		else if (ch === "?") re += "."
		else if (ch === "[") {
			const close = glob.indexOf("]", i + 1)
			if (close !== -1) {
				re += glob.slice(i, close + 1)
				i = close
			} else {
				re += "\\["
			}
		} else {
			re += ch.replace(/[.^$()+!|{}\\]/g, "\\$&")
		}
	}
	return new RegExp(`^${re}$`)
}

export default definePath({
	name: "branch-list-pattern",
	summary: "list local branches matching glob pattern(s)",
	spec: "branch (--list|-l) <pattern...>",

	async run(args, ctx) {
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "--json"])
		if (isExecResult(entries)) return entries
		const patterns = args.list.pattern ?? []
		const regexes = patterns.map(globToRegex)
		const locals = entries
			.filter((e) => e.local)
			.filter((e) => regexes.some((r) => r.test(e.name)))
			.sort((a, b) => (a.name < b.name ? -1 : 1))
		return ok(locals.map((e) => (e.current ? `* ${e.name}\n` : `  ${e.name}\n`)).join(""))
	},

	fixtures: [
		{
			name: "exact match, current starred",
			argv: ["branch", "--list", "test-wt"],
			arcReplies: {
				"branch --json": {
					stdout: JSON.stringify([
						{ local: true, name: "test-wt", current: true },
						{ local: true, name: "feature-x" },
						{ local: true, name: "trunk" },
					]),
				},
			},
			want: { stdout: "* test-wt\n", code: 0 },
		},
		{
			name: "glob prefix match",
			argv: ["branch", "--list", "per*"],
			arcReplies: {
				"branch --json": {
					stdout: JSON.stringify([
						{ local: true, name: "perception-latency-relays" },
						{ local: true, name: "perception-latency-relays-v2", current: true },
						{ local: true, name: "sim-control" },
					]),
				},
			},
			want: { stdout: "  perception-latency-relays\n* perception-latency-relays-v2\n", code: 0 },
		},
		{
			name: "no match prints nothing",
			argv: ["branch", "-l", "nonexistent"],
			arcReplies: {
				"branch --json": {
					stdout: JSON.stringify([
						{ local: true, name: "feature-x", current: true },
						{ local: true, name: "trunk" },
					]),
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "multiple patterns union",
			argv: ["branch", "--list", "test-wt", "dev*"],
			arcReplies: {
				"branch --json": {
					stdout: JSON.stringify([
						{ local: true, name: "dev-branch" },
						{ local: true, name: "test-wt", current: true },
						{ local: true, name: "trunk" },
					]),
				},
			},
			want: { stdout: "  dev-branch\n* test-wt\n", code: 0 },
		},
	],
})
