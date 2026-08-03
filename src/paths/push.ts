// git push [-u] [--force-with-lease|-f] [arcadia] [<refspec>] → arc push.
// REF LENS, push side (the asymmetric contract):
//   - users/<login>/ is injected IMPLICITLY: `git push arcadia foo` →
//     `arc push users/<login>/foo` (--set-upstream added only for -u:
//     upstream is a side effect git reserves for -u)
//   - double-prefix guard: a refspec already starting with users/ (or trunk)
//     is passed through untouched
//   - stdout/stderr report FULL EXPLICIT refs — arc's own output already
//     names the users/... ref; passthrough preserves that
//   - --force-with-lease downgrades to arc push -f (accepted contract)
// Login comes from arc info --json (user_login).
import { arcInfo, definePath, fail, isDetached, isExecResult, isRemoteAlias, ok, pushLens } from "../core"

export default definePath({
	name: "push",
	summary: "arc push with implicit users/<login>/ injection (push only)",
	spec: "push (-u|--set-upstream)? (-f|--force|--force-with-lease)? (-q|--quiet)? <remote>? <refspec>?",
	refine: (args) => {
		// explicit remote before a refspec must be arcadia/origin; a single
		// positional is handled in run (git reads it as a remote → fatal)
		if (args.pos.remote !== undefined && args.pos.refspec !== undefined) return isRemoteAlias(args.pos.remote)
		return true
	},

	async run(args, ctx) {
		let refspec = args.pos.refspec
		if (refspec === undefined && args.pos.remote !== undefined) {
			// git grammar: a single positional is the REMOTE, never a refspec —
			// `git push myfork` must not silently create users/<login>/myfork.
			if (!isRemoteAlias(args.pos.remote))
				return fail(
					128,
					`fatal: '${args.pos.remote}' does not appear to be a git repository\n` +
						`fatal: Could not read from remote repository.\n\n` +
						`Please make sure you have the correct access rights\n` +
						`and the repository exists.\n`,
				)
		}
		const arcArgs = ["push"]
		if (args.flags.has("-f") || args.flags.has("--force") || args.flags.has("--force-with-lease"))
			arcArgs.push("--force")
		if (refspec !== undefined && refspec.includes(":")) {
			// explicit src:dst (t3code publishes `push -u <remote> HEAD:refs/heads/<b>`).
			// arc push accepts refspecs verbatim and skips its users/<login>/
			// auto-prefix — which otherwise DOUBLES an already-prefixed local
			// branch name (arc prefixes the current branch unconditionally).
			const ci = refspec.indexOf(":")
			const src = refspec.slice(0, ci)
			const dstRaw = refspec.slice(ci + 1).replace(/^refs\/heads\//, "")
			if (!src || !dstRaw) return fail(128, `fatal: invalid refspec '${refspec}'\n`)
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			if (!info.user_login) return fail(128, "fatal: arc-git: cannot determine user login from arc info\n")
			const dst = pushLens(dstRaw, info.user_login)
			const r = await ctx.arc([...arcArgs, `${src}:${dst}`])
			if (r.code !== 0) return r
			if (args.flags.has("-u") || args.flags.has("--set-upstream")) {
				const upArgs = ["branch", "-u", dst]
				if (src !== "HEAD" && src !== info.branch) upArgs.push(src)
				const up = await ctx.arc(upArgs)
				if (up.code !== 0) return up
			}
			return r
		}
		if (refspec !== undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			const login = info.user_login
			if (!login) return fail(128, "fatal: arc-git: cannot determine user login from arc info\n")
			if (refspec === "HEAD") {
				// `git push origin HEAD` = push the current branch — must never
				// become users/<login>/HEAD
				if (isDetached(info.branch)) return fail(128, "fatal: You are not currently on a branch.\n")
				refspec = info.branch!
			}
			// upstream is a side effect git reserves for -u — never set it implicitly
			if (args.flags.has("-u") || args.flags.has("--set-upstream")) arcArgs.push("--set-upstream")
			arcArgs.push(pushLens(refspec, login))
		} else if (args.flags.has("-u") || args.flags.has("--set-upstream")) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			if (!info.branch || !info.user_login)
				return fail(128, "fatal: arc-git: cannot determine current branch for -u push\n")
			arcArgs.push("--set-upstream", pushLens(info.branch, info.user_login))
		}
		// full passthrough: arc reports the explicit users/... ref on stderr
		return ctx.arc(arcArgs)
	},

	fixtures: [
		{
			name: "t3code publish refspec pins exact remote name (no double prefix)",
			argv: ["push", "-u", "origin", "HEAD:refs/heads/users/darl/t3code/abc"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"users/darl/t3code/abc","user_login":"darl"}' },
				"push HEAD:users/darl/t3code/abc": {},
				"branch -u users/darl/t3code/abc": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "refspec dst lensed when unprefixed",
			argv: ["push", "arcadia", "HEAD:refs/heads/feature-x"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
				"push HEAD:users/darl/feature-x": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "implicit prefix injection (no -u: upstream untouched)",
			argv: ["push", "arcadia", "feature-x"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
				"push users/darl/feature-x": {
					stderr: "counting objects...\nref: users/darl/feature-x\n",
				},
			},
			want: { stdout: "", stderr: "counting objects...\nref: users/darl/feature-x\n", code: 0 },
		},
		{
			name: "single non-alias positional is a remote in git — fatal, no push",
			argv: ["push", "myfork"],
			arcReplies: {},
			want: {
				stderr:
					"fatal: 'myfork' does not appear to be a git repository\n" +
					"fatal: Could not read from remote repository.\n\n" +
					"Please make sure you have the correct access rights\n" +
					"and the repository exists.\n",
				code: 128,
			},
		},
		{
			name: "double-prefix guard",
			argv: ["push", "-u", "arcadia", "users/darl/feature-x"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
				"push --set-upstream users/darl/feature-x": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "HEAD refspec resolves to current branch (git push origin HEAD)",
			argv: ["push", "-u", "origin", "HEAD"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
				"push --set-upstream users/darl/feature-x": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "bare push goes to existing upstream",
			argv: ["push"],
			arcReplies: { push: {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "-u without refspec uses current branch",
			argv: ["push", "-u"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-y","user_login":"darl"}' },
				"push --set-upstream users/darl/feature-y": {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "force-with-lease downgrades to force",
			argv: ["push", "--force-with-lease", "origin", "feature-x"],
			arcReplies: {
				"info --json": { stdout: '{"user_login":"darl"}' },
				"push --force users/darl/feature-x": {},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
