// Plain `git branch` / `git branch --list` — local branches, current starred.
// arc branch --json is the source (GOLDEN shape).
import { arcJson, definePath, isExecResult, ok } from "../core"

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

export default definePath({
	name: "branch-list",
	summary: "list local branches, current marked with *",
	spec: "branch (--list|-l)?",

	async run(_args, ctx) {
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "--json"])
		if (isExecResult(entries)) return entries
		const locals = entries.filter((e) => e.local).sort((a, b) => (a.name < b.name ? -1 : 1))
		return ok(locals.map((e) => (e.current ? `* ${e.name}\n` : `  ${e.name}\n`)).join(""))
	},

	fixtures: [
		{
			name: "current branch starred",
			argv: ["branch"],
			arcReplies: {
				"branch --json": {
					stdout: '[{"local":true,"name":"feature-x","current":true},{"local":true,"name":"trunk"}]',
				},
			},
			want: { stdout: "* feature-x\n  trunk\n", code: 0 },
		},
	],
})
