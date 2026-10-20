// git fetch [--auto-gc|--no-auto-gc] … — the gc flags gate `git gc --auto`
// after the fetch; arc has no garbage collection, so both spellings are
// accepted and dropped, and the fetch itself is the existing `fetch`
// semantics. The gc flag is REQUIRED in the spec, so this path only claims
// argv shapes carrying it (specificity 2 beats fetch's 1 on those); every
// other fetch shape keeps dispatching to `fetch`. The run delegates
// wholesale to the fetch path — bare fetch still refreshes trunk + the
// current branch, and refspecs still unwrap/reject identically — so the
// two files can't drift apart.
import { definePath, isRemoteAlias } from "../core"
import fetchPath from "./fetch"

export default definePath({
	name: "fetch-no-auto-gc",
	summary: "arc fetch; --no-auto-gc/--auto-gc accepted and dropped (arc has no gc)",
	spec: "fetch (--auto-gc|--no-auto-gc) (--prune|-p)? --no-tags? (-q|--quiet)? --? <remote>? <branch>?",
	refine: (args) => {
		if (args.pos.remote !== undefined && args.pos.branch !== undefined) return isRemoteAlias(args.pos.remote)
		return true
	},

	async run(args, ctx) {
		args.flags.delete("--no-auto-gc")
		args.flags.delete("--auto-gc")
		return fetchPath.run(args, ctx)
	},

	fixtures: [
		{
			"name": "T3 background fetch with option separator",
			"argv": [
				"fetch",
				"--quiet",
				"--no-tags",
				"--no-auto-gc",
				"--",
				"arcadia"
			],
			"arcReplies": {
				"info --json": {
					"stdout": "{\"branch\":\"trunk\"}"
				},
				"fetch trunk": {}
			},
			"want": {
				"code": 0
			}
		},
		{
			name: "no-auto-gc bare fetch refreshes trunk and the current branch",
			argv: ["fetch", "--quiet", "--no-tags", "--no-auto-gc", "arcadia"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feat-x","user_login":"darl"}' },
				"fetch trunk": {},
				fetch: {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "auto-gc spelling dropped, explicit branch fetched",
			argv: ["fetch", "--auto-gc", "arcadia", "trunk"],
			arcReplies: { "fetch trunk": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "mirror refspec still unwrapped with gc flag present",
			argv: ["fetch", "--no-auto-gc", "--quiet", "origin", "+refs/heads/users/darl/x:refs/remotes/origin/users/darl/x"],
			arcReplies: { "fetch users/darl/x": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "pull-request refspec still rejected",
			argv: ["fetch", "--no-auto-gc", "origin", "+refs/pull/7/head:refs/heads/pr-7"],
			arcReplies: {},
			want: {
				stderr: "fatal: arc-git: refspec '+refs/pull/7/head:refs/heads/pr-7' not supported; fetch a plain branch name\n",
				code: 128,
			},
		},
	],
})
