// %(refname:strip=2) removes refs/heads/ from each local ref.
import { definePath, isExecResult, ok } from "../core"
import { byRefname, entryRefname, listBranches, refMatches, renderRef, shortRef } from "../refs"

export default definePath({
	name: "for-each-ref-heads-strip-two",
	summary: "list local branch names with refname strip=2",
	spec: "for-each-ref --format=<fmt> <pattern>",
	refine: (args) => args.pos.fmt === "%(refname:strip=2)" && args.pos.pattern === "refs/heads/",

	async run(args, ctx) {
		const entries = await listBranches(ctx)
		if (isExecResult(entries)) return entries
		const refs = entries
			.filter((entry) => entry.local)
			.map((entry) => ({ refname: entryRefname(entry), current: !!entry.current }))
			.filter((ref) => refMatches(args.pos.pattern!, ref.refname))
			.sort(byRefname)
		return ok(refs.map((ref) => renderRef(args.pos.fmt!, ref.refname, ref.current, {
			"refname:strip=2": shortRef(ref.refname),
		}) + "\n").join(""))
	},

	fixtures: [
		{
			name: "sorted local names retain nested components",
			argv: ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
			arcReplies: {
				"branch --json": { stdout: '[{"local":true,"name":"users/example/feature"},{"name":"arcadia/trunk"},{"local":true,"name":"trunk","current":true}]' },
			},
			want: { stdout: "trunk\nusers/example/feature\n", code: 0 },
		},
		{
			name: "no local branches",
			argv: ["for-each-ref", "--format", "%(refname:strip=2)", "refs/heads/"],
			arcReplies: { "branch --json": { stdout: '[]' } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "branch listing failure propagates",
			argv: ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"],
			arcReplies: { "branch --json": { code: 1, stderr: "branch listing failed\n" } },
			want: { stdout: "", stderr: "branch listing failed\n", code: 1 },
		},
	],
})
