// git rev-parse --short <rev>. git prints the shortest unique prefix (>=7);
// unique-prefix search is impractical against the monorepo, so the shim emits
// a fixed SHORT_HASH_LEN (12) prefix — long enough to stay unambiguous in
// Arcadia, and every arc command accepts it back as a prefix.
import { arcRev, badRevision, definePath, ok, SHORT_HASH_LEN } from "../core"

export default definePath({
	name: "rev-parse-short",
	summary: "resolve a revision to a short hash (fixed 12 chars)",
	spec: "rev-parse --short <rev>",
	refine: (args) => !args.pos.rev!.includes(":"),

	async run(args, ctx) {
		const r = await ctx.arc(["rev-parse", arcRev(args.pos.rev!)])
		if (r.code !== 0) return badRevision(args.pos.rev!)
		return ok(r.stdout.trim().slice(0, SHORT_HASH_LEN) + "\n")
	},

	fixtures: [
		{
			name: "short HEAD",
			argv: ["rev-parse", "--short", "HEAD"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0\n" },
			},
			want: { stdout: "a7819db772ee\n", code: 0 },
		},
	],
})
