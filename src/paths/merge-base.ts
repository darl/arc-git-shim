// git merge-base <a> <b> → OID. arc merge-base takes exactly two commits.
// Both revs go through arcRev: the shim's own rev-parse emulation hands out
// refs/remotes/arcadia/... and origin/... forms that come straight back here.
import { arcRev, definePath, ok } from "../core"

export default definePath({
	name: "merge-base",
	summary: "merge base of two commits",
	spec: "merge-base <a> <b>",

	async run(args, ctx) {
		const r = await ctx.arc(["merge-base", arcRev(args.pos.a!), arcRev(args.pos.b!)])
		if (r.code !== 0) return r
		const oid = r.stdout.trim()
		return ok(oid ? `${oid}\n` : "")
	},

	fixtures: [
		{
			name: "base of HEAD and trunk",
			argv: ["merge-base", "HEAD", "trunk"],
			arcReplies: {
				"merge-base HEAD trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n", code: 0 },
		},
		{
			name: "advertised full remote ref resolves",
			argv: ["merge-base", "refs/remotes/arcadia/trunk", "HEAD"],
			arcReplies: {
				"merge-base arcadia/trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n", code: 0 },
		},
	],
})
