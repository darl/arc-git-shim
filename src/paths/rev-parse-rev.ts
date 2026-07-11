// git rev-parse <rev> → full 40-char OID. arc rev-parse resolves revs natively.
// arc's failure text differs; reshape to git's fatal (exit 128, git says 128
// for unknown revision with a lone rev argument).
import { badRevision, definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-rev",
	summary: "resolve a revision to its full hash",
	spec: "rev-parse <rev>",
	// rev:path / :path shapes belong to `show`; pathspecs are not revisions here
	refine: (args) => !args.pos.rev!.includes(":"),

	async run(args, ctx) {
		const r = await ctx.arc(["rev-parse", args.pos.rev!])
		if (r.code !== 0) return badRevision(args.pos.rev!)
		return ok(r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n")
	},

	fixtures: [
		{
			name: "HEAD resolves",
			argv: ["rev-parse", "HEAD"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0\n" },
			},
			want: { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0\n", code: 0 },
		},
		{
			name: "unknown rev is a git-shaped fatal",
			argv: ["rev-parse", "nosuchref"],
			arcReplies: {
				"rev-parse nosuchref": {
					stderr: "Error: ambiguous argument 'nosuchref': unknown revision or path not in the working tree.\n",
					code: 1,
				},
			},
			want: {
				stdout: "",
				stderr:
					"fatal: ambiguous argument 'nosuchref': unknown revision or path not in the working tree.\n" +
					"Use '--' to separate paths from revisions, like this:\n" +
					"'git <command> [<revision>...] -- [<file>...]'\n",
				code: 128,
			},
		},
	],
})
