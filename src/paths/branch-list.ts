// Plain `git branch` / `git branch --list` — local branches, current starred.
// --format=%(refname:short) emits bare names (t3code's listLocalBranchNames);
// --no-column accepted (single-column is the only output anyway).
// arc branch --json is the source (GOLDEN shape).
import { arcJson, definePath, fail, isExecResult, ok } from "../core"

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

export default definePath({
	name: "branch-list",
	summary: "list local branches, current marked with *",
	spec: "branch (--list|-l)? --no-column? --format=<fmt>?",

	async run(args, ctx) {
		const fmt = args.pos.fmt
		if (fmt !== undefined && fmt !== "%(refname:short)")
			return fail(128, `fatal: arc-git: unsupported branch --format '${fmt}'\n`)
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "--json"])
		if (isExecResult(entries)) return entries
		const locals = entries.filter((e) => e.local).sort((a, b) => (a.name < b.name ? -1 : 1))
		if (fmt !== undefined) return ok(locals.map((e) => `${e.name}\n`).join(""))
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
		{
			name: "refname:short format emits bare names (t3code)",
			argv: ["branch", "--list", "--no-column", "--format=%(refname:short)"],
			arcReplies: {
				"branch --json": {
					stdout: '[{"local":true,"name":"feature-x","current":true},{"local":true,"name":"trunk"}]',
				},
			},
			want: { stdout: "feature-x\ntrunk\n", code: 0 },
		},
	],
})
