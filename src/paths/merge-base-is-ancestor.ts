// git merge-base --is-ancestor <a> <b>: exit 0 iff a is an ancestor of b.
// arc has no --is-ancestor → computed: a is an ancestor of b iff
// merge-base(a,b) == rev-parse(a). Exit code is the whole answer (orca).
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "merge-base-is-ancestor",
	summary: "ancestor check via merge-base == rev-parse comparison",
	spec: "merge-base --is-ancestor <a> <b>",

	async run(args, ctx) {
		const mb = await ctx.arc(["merge-base", args.pos.a!, args.pos.b!])
		if (mb.code !== 0) return fail(128, `fatal: Not a valid commit name ${args.pos.a}\n`)
		const a = await ctx.arc(["rev-parse", args.pos.a!])
		if (a.code !== 0) return fail(128, `fatal: Not a valid commit name ${args.pos.a}\n`)
		return mb.stdout.trim() === a.stdout.trim() ? ok() : fail(1, "")
	},

	fixtures: [
		{
			name: "is ancestor: exit 0",
			argv: ["merge-base", "--is-ancestor", "trunk", "HEAD"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"rev-parse trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "not ancestor: exit 1, silent",
			argv: ["merge-base", "--is-ancestor", "HEAD", "trunk"],
			arcReplies: {
				"merge-base HEAD trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"rev-parse HEAD": { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0\n" },
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
	],
})
