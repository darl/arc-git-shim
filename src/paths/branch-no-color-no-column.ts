// `git branch --no-color --no-column` — list local branches, current starred.
// --no-color and --no-column are formatting flags that are no-ops for the
// shim: it never emits ANSI color and always lists one branch per line.
// The output shape is identical to plain `git branch` (see branch-list).
import { arcJson, definePath, isExecResult, ok } from "../core"

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

export default definePath({
	name: "branch-no-color-no-column",
	summary: "list local branches with --no-color --no-column formatting flags",
	spec: "branch --no-color --no-column",

	async run(_args, ctx) {
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "--json"])
		if (isExecResult(entries)) return entries
		const locals = entries.filter((e) => e.local).sort((a, b) => (a.name < b.name ? -1 : 1))
		return ok(locals.map((e) => (e.current ? `* ${e.name}\n` : `  ${e.name}\n`)).join(""))
	},

	fixtures: [
		{
			name: "lists local branches, current starred",
			argv: ["branch", "--no-color", "--no-column"],
			arcReplies: {
				"branch --json": {
					stdout:
						'[{"local":true,"name":"trunk"},{"local":true,"name":"feature-x","current":true},{"local":true,"name":"users/darl/dev"}]',
				},
			},
			want: { stdout: "* feature-x\n  trunk\n  users/darl/dev\n", code: 0 },
		},
	],
})
