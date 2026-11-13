// List local and remote-tracking branches in git's branch -a layout.
import { definePath, isExecResult, ok } from "../core"
import { byRefname, entryRefname, listBranches } from "../refs"

export default definePath({
	name: "branch-all",
	summary: "list local and remote-tracking branches",
	spec: "branch -a",

	async run(_args, ctx) {
		const entries = await listBranches(ctx, "-a")
		if (isExecResult(entries)) return entries
		const sorted = entries.map((entry) => ({ entry, refname: entryRefname(entry) })).sort(byRefname)
		return ok(sorted.map(({ entry }) =>
			entry.local ? `${entry.current ? "*" : " "} ${entry.name}\n` : `  remotes/${entry.name}\n`,
		).join(""))
	},

	fixtures: [
		{
			name: "local and remote branches sorted and marked",
			argv: ["branch", "-a"],
			arcReplies: {
				"branch -a --json": { stdout: JSON.stringify([
					{ name: "arcadia/users/darl/feature-x" },
					{ local: true, name: "trunk" },
					{ name: "arcadia/trunk" },
					{ local: true, name: "feature-x", current: true },
				]) },
			},
			want: { stdout: "* feature-x\n  trunk\n  remotes/arcadia/trunk\n  remotes/arcadia/users/darl/feature-x\n", code: 0 },
		},
		{
			name: "arc failure propagates",
			argv: ["branch", "-a"],
			arcReplies: { "branch -a --json": { stderr: "branch listing failed\n", code: 1 } },
			want: { stdout: "", stderr: "branch listing failed\n", code: 1 },
		},
	],
})
