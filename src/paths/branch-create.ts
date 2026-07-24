// git branch <name> [<start>] / git branch --force <name> [<start>] —
// create (or reset) a branch without switching to it. arc branch supports
// [BRANCH] [START] positionals but has no --force for create; force is
// emulated by deleting the branch first (-D fails on the current branch,
// matching git's "cannot force update the current branch" refusal).
// t3code materializes remote branches this way (branch [--force] <b> <ref>)
// and creates plain refs (branch <b>).
import { definePath, ok } from "../core"

export default definePath({
	name: "branch-create",
	summary: "create/reset a branch at a start point via arc branch",
	spec: "branch (-f|--force)? (-q|--quiet)? <name> <start>?",

	async run(args, ctx) {
		const name = args.pos.name!
		if (args.flags.has("-f") || args.flags.has("--force")) {
			await ctx.arc(["branch", "-D", name]) // absent branch → error, ignored
		}
		const arcArgs = ["branch", name]
		if (args.pos.start !== undefined) arcArgs.push(args.pos.start)
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		return ok("") // git branch prints nothing on success
	},

	fixtures: [
		{
			name: "create at start point",
			argv: ["branch", "feature-w", "arcadia/users/darl/feature-w"],
			arcReplies: { "branch feature-w arcadia/users/darl/feature-w": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "bare create (t3code createRef)",
			argv: ["branch", "checkpoint-base"],
			arcReplies: { "branch checkpoint-base": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "force resets existing branch",
			argv: ["branch", "--force", "feature-w", "arcadia/users/darl/feature-w"],
			arcReplies: {
				"branch -D feature-w": { stdout: "Deleted branch feature-w\n" },
				"branch feature-w arcadia/users/darl/feature-w": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
