// List HEAD followed by all local and remote branch refs in git refname order.
import { definePath, fail, isExecResult, ok } from "../core"
import { byRefname, entryRefname, listBranches } from "../refs"

export default definePath({
	name: "show-ref-head",
	summary: "list HEAD and branch refs with their commit IDs",
	spec: "show-ref --head",

	async run(_args, ctx) {
		const head = await ctx.arc(["rev-parse", "HEAD"])
		if (head.code !== 0) return head
		const entries = await listBranches(ctx, "-a", "-v")
		if (isExecResult(entries)) return entries
		const refs = entries.map((entry) => ({ refname: entryRefname(entry), hash: entry.commit?.id }))
		if (refs.some((ref) => !ref.hash)) return fail(128, "fatal: arc-git: missing branch commit ID\n")
		refs.sort(byRefname)
		return ok(`${head.stdout.trim()} HEAD\n` + refs.map((ref) => `${ref.hash} ${ref.refname}\n`).join(""))
	},

	fixtures: [
		{
			name: "HEAD and sorted local and remote refs",
			argv: ["show-ref", "--head"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" },
				"branch -a -v --json": { stdout: '[{"name":"arcadia/trunk","commit":{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}},{"local":true,"name":"feature-x","current":true,"commit":{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}]' },
			},
			want: { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/feature-x\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb refs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			name: "detached HEAD without branches",
			argv: ["show-ref", "--head"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" },
				"branch -a -v --json": { stdout: "[]" },
			},
			want: { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa HEAD\n", code: 0 },
		},
		{
			name: "branch enumeration failure",
			argv: ["show-ref", "--head"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" },
				"branch -a -v --json": { stderr: "arc error\n", code: 1 },
			},
			want: { stderr: "arc error\n", code: 1 },
		},
	],
})
