// `git branch --no-color --no-column --remotes` — list remote-tracking
// branches.  --no-color and --no-column are formatting no-ops for the shim
// (it never emits ANSI color or columns).  --remotes (equivalently -r)
// restricts the listing to remote-tracking branches, printed with a
// 2-space indent and no current-branch marker (remote refs are never HEAD).
//
// Source is `arc branch -a --json`: entries without a `local` flag are
// remote-tracking branches whose names already carry the remote prefix
// (e.g. "arcadia/trunk"), matching git's `git branch -r` output shape.
//
// Spec specificity is 1 + 3 = 4 (three required flags), strictly more
// specific than `branch --no-color --no-column` (specificity 3), so there
// is no dispatch collision — the stricter spec wins.

import { arcJson, definePath, isExecResult, ok } from "../core"

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

export default definePath({
	name: "branch-no-color-no-column-remotes",
	summary: "list remote-tracking branches with --no-color --no-column --remotes",
	spec: "branch --no-color --no-column --remotes",

	async run(_args, ctx) {
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "-a", "--json"])
		if (isExecResult(entries)) return entries
		const remotes = entries
			.filter((e) => !e.local)
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		return ok(remotes.map((e) => `  ${e.name}\n`).join(""))
	},

	fixtures: [
		{
			name: "lists remote branches sorted, 2-space indent",
			argv: ["branch", "--no-color", "--no-column", "--remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([
						{ local: true, name: "trunk", current: true },
						{ name: "arcadia/trunk" },
						{ name: "arcadia/users/darl/foo" },
						{ local: true, name: "dev" },
						{ name: "arcadia/users/darl/bar" },
					]),
				},
			},
			want: {
				stdout: "  arcadia/trunk\n  arcadia/users/darl/bar\n  arcadia/users/darl/foo\n",
				code: 0,
			},
		},
		{
			name: "no remote branches returns empty",
			argv: ["branch", "--no-color", "--no-column", "--remotes"],
			arcReplies: {
				"branch -a --json": {
					stdout: JSON.stringify([{ local: true, name: "trunk", current: true }]),
				},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
