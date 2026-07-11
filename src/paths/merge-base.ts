// git merge-base <a> <b> → OID. arc merge-base takes exactly two commits.
import { definePath, ok } from "../core"

export default definePath({
	name: "merge-base",
	summary: "merge base of two commits",
	spec: "merge-base <a> <b>",

	async run(args, ctx) {
		const r = await ctx.arc(["merge-base", args.pos.a!, args.pos.b!])
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
	],
})
