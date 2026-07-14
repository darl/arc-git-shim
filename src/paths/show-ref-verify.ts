// git show-ref --verify [--quiet|-q] <ref> checks whether a single ref exists.
// Arc has no show-ref; arc rev-parse resolves the normalized ref. With --quiet
// the only signal is the exit code: 0 = exists, 1 = missing. Without --quiet,
// git prints "<hash> <ref>\n" on success or dies (exit 128) with
// "fatal: '<ref>' - not a valid ref" on failure.
//
// The ref is normalized via arcRev (origin→arcadia alias, refs/heads/ stripped,
// etc.). For the non-quiet stdout we echo the canonical (arcadia) ref name.
import { arcRev, definePath, fail, ok } from "../core"

export default definePath({
	name: "show-ref-verify",
	summary: "verify existence of a single ref (exit-code probe with --quiet)",
	spec: "show-ref --verify (-q|--quiet)? <ref>",

	async run(args, ctx) {
		const quiet = args.flags.has("--quiet") || args.flags.has("-q")
		const ref = args.pos.ref!
		const r = await ctx.arc(["rev-parse", arcRev(ref)])
		if (r.code !== 0) {
			if (quiet) return fail(1, "")
			return fail(128, `fatal: '${ref}' - not a valid ref\n`)
		}
		if (quiet) return ok("")
		const hash = r.stdout.trim()
		const displayRef = ref.replace(/^refs\/remotes\/origin\//, "refs/remotes/arcadia/")
		return ok(`${hash} ${displayRef}\n`)
	},

	fixtures: [
		{
			name: "existing remote-tracking ref, quiet",
			argv: ["show-ref", "--verify", "--quiet", "refs/remotes/origin/trunk"],
			arcReplies: {
				"rev-parse arcadia/trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "existing remote-tracking ref, loud",
			argv: ["show-ref", "--verify", "refs/remotes/arcadia/trunk"],
			arcReplies: {
				"rev-parse arcadia/trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df refs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			// The exact command that triggered this path: refs/remotes/origin/arcadia/trunk
			// normalises to arcadia/arcadia/trunk which arc cannot resolve → ref missing.
			name: "missing ref (origin/arcadia/trunk), quiet: silent exit 1",
			argv: ["show-ref", "--verify", "--quiet", "refs/remotes/origin/arcadia/trunk"],
			arcReplies: {
				"rev-parse arcadia/arcadia/trunk": {
					stderr: "Error: ambiguous argument 'arcadia/arcadia/trunk': unknown revision or path not in the working tree.\n",
					code: 1,
				},
			},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "missing ref, loud: git fatal 128",
			argv: ["show-ref", "--verify", "refs/heads/nosuch"],
			arcReplies: {
				"rev-parse nosuch": {
					stderr: "Error: ambiguous argument 'nosuch': unknown revision or path not in the working tree.\n",
					code: 1,
				},
			},
			want: { stdout: "", stderr: "fatal: 'refs/heads/nosuch' - not a valid ref\n", code: 128 },
		},
		{
			name: "short -q flag, existing ref",
			argv: ["show-ref", "--verify", "-q", "refs/remotes/arcadia/trunk"],
			arcReplies: {
				"rev-parse arcadia/trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "origin alias normalised to arcadia in loud output",
			argv: ["show-ref", "--verify", "refs/remotes/origin/trunk"],
			arcReplies: {
				"rev-parse arcadia/trunk": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df refs/remotes/arcadia/trunk\n", code: 0 },
		},
	],
})
