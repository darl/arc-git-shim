// git push [-u] [--force-with-lease|-f] [arcadia] [<refspec>] → arc push.
// REF LENS, push side (the asymmetric contract):
//   - users/<login>/ is injected IMPLICITLY: `git push arcadia foo` →
//     `arc push -u users/<login>/foo`
//   - double-prefix guard: a refspec already starting with users/ (or trunk)
//     is passed through untouched
//   - stdout/stderr report FULL EXPLICIT refs — arc's own output already
//     names the users/... ref; passthrough preserves that
//   - --force-with-lease downgrades to arc push -f (accepted contract)
// Login comes from arc info --json (user_login).
import { arcInfo, definePath, fail, isExecResult, isRemoteAlias, ok, pushLens } from "../core"

export default definePath({
	name: "push",
	summary: "arc push with implicit users/<login>/ injection (push only)",
	spec: "push (-u|--set-upstream)? (-f|--force|--force-with-lease)? (-q|--quiet)? <remote>? <refspec>?",
	refine: (args) => {
		// single non-remote arg is a refspec; explicit remote must be arcadia/origin
		if (args.pos.remote !== undefined && args.pos.refspec !== undefined) return isRemoteAlias(args.pos.remote)
		return !(args.pos.remote ?? "").includes(":") // src:dst refspecs → learnable
	},

	async run(args, ctx) {
		let refspec = args.pos.refspec ?? args.pos.remote
		if (refspec !== undefined && args.pos.refspec === undefined && isRemoteAlias(refspec)) refspec = undefined
		const arcArgs = ["push"]
		if (args.flags.has("-f") || args.flags.has("--force") || args.flags.has("--force-with-lease"))
			arcArgs.push("--force")
		if (refspec !== undefined) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			const login = info.user_login
			if (!login) return fail(128, "fatal: arc-git: cannot determine user login from arc info\n")
			arcArgs.push("--set-upstream", pushLens(refspec, login))
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
			name: "implicit prefix injection",
			argv: ["push", "arcadia", "feature-x"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","user_login":"darl"}' },
				"push --set-upstream users/darl/feature-x": {
					stderr: "counting objects...\nref: users/darl/feature-x\n",
				},
			},
			want: { stdout: "", stderr: "counting objects...\nref: users/darl/feature-x\n", code: 0 },
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
				"push --force --set-upstream users/darl/feature-x": {},
			},
			want: { stdout: "", code: 0 },
		},
	],
})
