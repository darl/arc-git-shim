// git fetch [--prune] [arcadia [<branch>]] → arc fetch [<branch>].
// Branch names literal (lens never touches the fetch side); --prune accepted
// and dropped (arc has no prune; unfetch is manual). Exit-code tier.
import { definePath, fail, isRemoteAlias, ok } from "../core"

export default definePath({
	name: "fetch",
	summary: "arc fetch passthrough; prune accepted and dropped",
	spec: "fetch (--prune|-p)? --no-tags? (-q|--quiet)? <remote>? <branch>?",
	refine: (args) => {
		if (args.pos.remote !== undefined && args.pos.branch !== undefined) return isRemoteAlias(args.pos.remote)
		return true
	},

	async run(args, ctx) {
		let branch = args.pos.branch ?? args.pos.remote
		if (branch !== undefined && args.pos.branch === undefined && isRemoteAlias(branch)) branch = undefined
		if (branch !== undefined && branch.includes(":"))
			return fail(128, `fatal: arc-git: refspec '${branch}' not supported; fetch a plain branch name\n`)
		const arcArgs = ["fetch"]
		if (branch !== undefined) arcArgs.push(branch)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "bare fetch",
			argv: ["fetch"],
			arcReplies: { fetch: {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "fetch a branch literally",
			argv: ["fetch", "arcadia", "trunk"],
			arcReplies: { "fetch trunk": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "prune dropped",
			argv: ["fetch", "--prune", "origin"],
			arcReplies: { fetch: {} },
			want: { stdout: "", code: 0 },
		},
	],
})
