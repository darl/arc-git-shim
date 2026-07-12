// git pull [--rebase|--ff-only] [arcadia [<branch>]] → arc pull [<branch>].
// REF LENS, pull side: the branch name is LITERAL — never inject
// users/<login>/ on pull. "origin" accepted as remote alias.
import { definePath, fail, isRemoteAlias, ok } from "../core"

export default definePath({
	name: "pull",
	summary: "arc pull; branch names literal (no ref-lens injection)",
	spec: "pull (--rebase|-r)? --ff-only? (-q|--quiet)? <remote>? <branch>?",
	refine: (args) =>
		args.pos.remote === undefined ||
		isRemoteAlias(args.pos.remote) ||
		// `git pull trunk`-style single arg: treat the lone token as a branch
		args.pos.branch === undefined,

	async run(args, ctx) {
		let branch = args.pos.branch
		let remote = args.pos.remote
		if (remote !== undefined && !isRemoteAlias(remote) && branch === undefined) {
			branch = remote
			remote = undefined
		}
		if (remote !== undefined && !isRemoteAlias(remote))
			return fail(1, `fatal: '${remote}' does not appear to be a git repository\n`)
		const arcArgs = ["pull"]
		if (args.flags.has("--rebase") || args.flags.has("-r")) arcArgs.push("--rebase")
		if (args.flags.has("--ff-only")) arcArgs.push("--ff-only")
		if (branch !== undefined) arcArgs.push(branch)
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "pull trunk literally (no prefix injection)",
			argv: ["pull", "arcadia", "trunk"],
			arcReplies: { "pull trunk": { stdout: "Already up to date.\n" } },
			want: { stdout: "Already up to date.\n", code: 0 },
		},
		{
			name: "bare pull",
			argv: ["pull"],
			arcReplies: { pull: { stdout: "Already up to date.\n" } },
			want: { stdout: "Already up to date.\n", code: 0 },
		},
		{
			name: "single arg is a branch, still literal",
			argv: ["pull", "users/darl/feature-x"],
			arcReplies: { "pull users/darl/feature-x": { stdout: "Updating...\n" } },
			want: { stdout: "Updating...\n", code: 0 },
		},
		{
			name: "ff-only forwarded",
			argv: ["pull", "--ff-only", "origin", "trunk"],
			arcReplies: { "pull --ff-only trunk": { stdout: "Already up to date.\n" } },
			want: { stdout: "Already up to date.\n", code: 0 },
		},
	],
})
