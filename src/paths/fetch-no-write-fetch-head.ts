// Arc fetch does not write Git's FETCH_HEAD; retain the existing fetch
// behavior while accepting Git's explicit request not to write it.
import { definePath, isRemoteAlias } from "../core"
import fetchPath from "./fetch"

export default definePath({
	name: "fetch-no-write-fetch-head",
	summary: "fetch without writing FETCH_HEAD",
	spec: "fetch --no-write-fetch-head (--auto-gc|--no-auto-gc)? (--prune|-p)? --no-tags? (-q|--quiet)? --? <remote>? <branch>?",
	refine: (args) => {
		if (args.pos.remote !== undefined && args.pos.branch !== undefined) return isRemoteAlias(args.pos.remote)
		return true
	},

	async run(args, ctx) {
		return fetchPath.run(args, ctx)
	},

	fixtures: [
		{
			name: "quiet background fetch refreshes trunk and current branch",
			argv: ["fetch", "--quiet", "--no-tags", "--no-auto-gc", "--no-write-fetch-head", "--", "arcadia"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x"}' },
				"fetch trunk": {},
				fetch: {},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "explicit branch and origin alias",
			argv: ["fetch", "--no-write-fetch-head", "origin", "trunk"],
			arcReplies: { "fetch trunk": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "trunk fetch failure propagates",
			argv: ["fetch", "--no-write-fetch-head", "arcadia"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"trunk"}' },
				"fetch trunk": { code: 1, stderr: "network error\n" },
			},
			want: { code: 1, stderr: "network error\n" },
		},
	],
})
