// git fetch [--prune] [arcadia [<branch>]] → arc fetch.
// Branch names literal (lens never touches the fetch side); --prune accepted
// and dropped (arc has no prune; unfetch is manual). Exit-code tier.
//
// BARE FETCH IS NOT A PASSTHROUGH: git `fetch [origin]` refreshes EVERY
// remote-tracking ref, but bare `arc fetch` refreshes only the current
// branch's remote counterpart. Tools bare-fetch precisely so they can
// re-resolve origin/trunk afterwards (t3code resolves it to a SHA and pins
// new worktrees to it — the passthrough left worktrees on days-old trunk),
// so trunk is fetched explicitly; the current branch keeps arc's bare-fetch
// refresh, best-effort (a local-only branch has no remote to fetch).
import { arcInfo, definePath, fail, isDetached, isExecResult, isRemoteAlias } from "../core"

export default definePath({
	name: "fetch",
	summary: "arc fetch; bare fetch refreshes trunk + current branch",
	spec: "fetch (--prune|-p)? --no-tags? (-q|--quiet)? <remote>? <branch>?",
	refine: (args) => {
		if (args.pos.remote !== undefined && args.pos.branch !== undefined) return isRemoteAlias(args.pos.remote)
		return true
	},

	async run(args, ctx) {
		let branch = args.pos.branch ?? args.pos.remote
		if (branch !== undefined && args.pos.branch === undefined && isRemoteAlias(branch)) branch = undefined
		if (branch !== undefined && branch.includes(":")) {
			// mirror refspec +refs/heads/<b>:refs/remotes/<remote>/<b> (t3code's
			// fetchRemoteBranch) → arc fetch <b>; anything else (refs/pull/…) has
			// no arc equivalent
			const m = branch.match(/^\+?refs\/heads\/(.+):refs\/remotes\/(?:arcadia|origin)\/(.+)$/)
			if (!m || m[1] !== m[2])
				return fail(128, `fatal: arc-git: refspec '${branch}' not supported; fetch a plain branch name\n`)
			branch = m[1]
		}
		if (branch === undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			const t = await ctx.arc(["fetch", "trunk"])
			if (t.code !== 0) return t
			if (info.branch !== "trunk" && !isDetached(info.branch)) await ctx.arc(["fetch"])
			return t
		}
		const r = await ctx.arc(["fetch", branch])
		return r
	},

	fixtures: [
		{
			name: "bare fetch refreshes trunk and the current branch",
			argv: ["fetch"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feat-x","user_login":"darl"}' },
				"fetch trunk": {},
				fetch: {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "bare fetch on trunk skips the duplicate current-branch fetch",
			argv: ["fetch", "origin"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"trunk","user_login":"darl"}' },
				"fetch trunk": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "current-branch fetch failure ignored (local-only branch)",
			argv: ["fetch"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"scratch","user_login":"darl"}' },
				"fetch trunk": {},
				fetch: { stderr: "error: branch scratch not found in remote\n", code: 1 },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "detached HEAD: trunk only",
			argv: ["fetch"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0"}' },
				"fetch trunk": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "fetch a branch literally",
			argv: ["fetch", "arcadia", "trunk"],
			arcReplies: { "fetch trunk": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "prune dropped, bare path taken",
			argv: ["fetch", "--prune", "origin"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feat-x","user_login":"darl"}' },
				"fetch trunk": {},
				fetch: {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "mirror refspec unwrapped (t3code fetchRemoteBranch)",
			argv: ["fetch", "--quiet", "--no-tags", "origin", "+refs/heads/users/darl/x:refs/remotes/origin/users/darl/x"],
			arcReplies: { "fetch users/darl/x": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "pull-request refspec rejected",
			argv: ["fetch", "--quiet", "--no-tags", "origin", "+refs/pull/42/head:refs/heads/pr-42"],
			arcReplies: {},
			want: {
				stderr: "fatal: arc-git: refspec '+refs/pull/42/head:refs/heads/pr-42' not supported; fetch a plain branch name\n",
				code: 128,
			},
		},
	],
})
