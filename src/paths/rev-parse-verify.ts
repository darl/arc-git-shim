// orca probes ref existence: rev-parse --verify [--quiet] <ref>[^{commit}]
// Exit 1 (quiet: silent) = ref missing — that exit code is DATA for orca.
// arc rev-parse has no --verify; a plain resolve + exit-code mapping matches.
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "rev-parse-verify",
	summary: "ref existence probe: OID on stdout, exit 1 when missing",
	spec: "rev-parse --verify (--quiet|-q)? <ref>",

	async run(args, ctx) {
		const quiet = args.flags.has("--quiet") || args.flags.has("-q")
		const ref = args.pos.ref!.replace(/\^\{commit\}$/, "")
		const r = await ctx.arc(["rev-parse", ref])
		if (r.code !== 0) return quiet ? fail(1, "") : fail(128, "fatal: Needed a single revision\n")
		return ok(r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n")
	},

	fixtures: [
		{
			name: "existing ref with ^{commit} suffix",
			argv: ["rev-parse", "--verify", "--quiet", "trunk^{commit}"],
			arcReplies: {
				"rev-parse trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n", code: 0 },
		},
		{
			name: "missing ref, quiet: silent exit 1",
			argv: ["rev-parse", "--verify", "--quiet", "users/darl/nope"],
			arcReplies: {
				"rev-parse users/darl/nope": { stderr: "Error: ambiguous argument 'users/darl/nope'\n", code: 1 },
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "missing ref, loud: git fatal 128",
			argv: ["rev-parse", "--verify", "nosuch"],
			arcReplies: {
				"rev-parse nosuch": { stderr: "Error: ambiguous argument 'nosuch'\n", code: 1 },
			},
			want: { stdout: "", stderr: "fatal: Needed a single revision\n", code: 128 },
		},
	],
})
