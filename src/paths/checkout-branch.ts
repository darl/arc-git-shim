// git checkout <target> / checkout -b <br> [<base>] / git switch [-c] —
// exit-code tier, direct arc checkout mapping. NOTE: arc checkout rejects
// the "--" separator; the paths form lives in checkout-paths.
import { definePath, isRemoteAlias, ok } from "../core"

export default definePath({
	name: "checkout-branch",
	summary: "switch branches / create via arc checkout",
	spec: "checkout -b=<newbr>? (-q|--quiet)? (--track|-t)? --no-track? (-f|--force)? <target>?",
	refine: (args) => args.pos.newbr !== undefined || args.pos.target !== undefined,

	async run(args, ctx) {
		const arcArgs = ["checkout"]
		if (args.pos.newbr !== undefined) arcArgs.push("-b", args.pos.newbr)
		if (args.flags.has("--no-track")) arcArgs.push("--no-track")
		if (args.flags.has("-f") || args.flags.has("--force")) arcArgs.push("--force")
		let target = args.pos.target
		// checkout --track <remote>/<branch>: arc auto-tracks arcadia/<branch>
		// when checking out a remote branch name — strip the remote segment
		if (target !== undefined && (args.flags.has("--track") || args.flags.has("-t"))) {
			const slash = target.indexOf("/")
			if (slash > 0 && isRemoteAlias(target.slice(0, slash))) target = target.slice(slash + 1)
		}
		if (target !== undefined) arcArgs.push(target)
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return args.flags.has("-q") || args.flags.has("--quiet") ? ok("") : r
	},

	fixtures: [
		{
			name: "switch to existing branch",
			argv: ["checkout", "trunk"],
			arcReplies: { "checkout trunk": { stdout: "Switched to branch 'trunk'\n" } },
			want: { stdout: "Switched to branch 'trunk'\n", code: 0 },
		},
		{
			name: "create from base",
			argv: ["checkout", "-b", "feature-y", "trunk"],
			arcReplies: { "checkout -b feature-y trunk": { stdout: "Switched to a new branch 'feature-y'\n" } },
			want: { stdout: "Switched to a new branch 'feature-y'\n", code: 0 },
		},
		{
			name: "track strips remote segment (t3code switchRef)",
			argv: ["checkout", "--track", "origin/users/darl/feature-z"],
			arcReplies: {
				"checkout users/darl/feature-z": { stdout: "Switched to a new branch 'users/darl/feature-z'\n" },
			},
			want: { stdout: "Switched to a new branch 'users/darl/feature-z'\n", code: 0 },
		},
	],
})
