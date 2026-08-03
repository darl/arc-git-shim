// git pull [--rebase|--ff-only] [arcadia [<branch>]] → arc pull [<branch>].
// REF LENS, pull side: the branch name is LITERAL — never inject
// users/<login>/ on pull. "origin" accepted as remote alias.
// SEMANTIC GUARD: git pull <remote> <branch> merges <branch> into the
// CURRENT branch, but `arc pull <name>` advances the local ref <name>
// instead (that's why the fetch translation prefers it). The two agree only
// when <name> IS the current branch — anything else is a codified fatal
// rather than a silent update of a different ref.
import { arcInfo, definePath, fail, isDetached, isExecResult, isRemoteAlias } from "../core"

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
		const arcArgs = ["pull"]
		if (args.flags.has("--rebase") || args.flags.has("-r")) arcArgs.push("--rebase")
		if (args.flags.has("--ff-only")) arcArgs.push("--ff-only")
		if (branch !== undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			if (isDetached(info.branch)) return fail(128, "fatal: You are not currently on a branch.\n")
			if (branch !== info.branch)
				return fail(
					128,
					`fatal: arc-git: pulling '${branch}' while on '${info.branch}' is not supported: ` +
						`arc pull would update the local ref '${branch}', not merge it into '${info.branch}'\n`,
				)
			arcArgs.push(branch)
		}
		return ctx.arc(arcArgs)
	},

	fixtures: [
		{
			name: "pull trunk literally while ON trunk (no prefix injection)",
			argv: ["pull", "arcadia", "trunk"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"trunk","user_login":"darl"}' },
				"pull trunk": { stdout: "Already up to date.\n" },
			},
			want: { stdout: "Already up to date.\n", code: 0 },
		},
		{
			name: "pulling another branch is a codified fatal, not a silent ref update",
			argv: ["pull", "arcadia", "trunk"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
			},
			want: {
				stdout: "",
				stderr:
					"fatal: arc-git: pulling 'trunk' while on 'feature-x' is not supported: " +
					"arc pull would update the local ref 'trunk', not merge it into 'feature-x'\n",
				code: 128,
			},
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
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/feature-x","user_login":"darl"}' },
				"pull users/darl/feature-x": { stdout: "Updating...\n" },
			},
			want: { stdout: "Updating...\n", code: 0 },
		},
		{
			name: "ff-only forwarded",
			argv: ["pull", "--ff-only", "origin", "trunk"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"trunk","user_login":"darl"}' },
				"pull --ff-only trunk": { stdout: "Already up to date.\n" },
			},
			want: { stdout: "Already up to date.\n", code: 0 },
		},
	],
})
