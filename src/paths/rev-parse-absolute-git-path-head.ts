// --path-format affects subsequent output only, so retain argv order by
// capturing the remaining tokens rather than treating both options as unordered.
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-absolute-git-path-head",
	summary: "absolute path to HEAD inside the arc metadata directory",
	spec: "rev-parse --path-format=absolute *",

	refine(args) {
		const rest = args.list.rest ?? []
		return (rest.length === 2 && rest[0] === "--git-path" && rest[1] === "HEAD") ||
			(rest.length === 1 && rest[0] === "--git-path=HEAD")
	},

	async run(_args, ctx) {
		return ok(`${ctx.arcRoot === "/" ? "" : ctx.arcRoot}/.arc/HEAD\n`)
	},

	fixtures: [
		{
			name: "absolute HEAD path at root",
			argv: ["rev-parse", "--path-format=absolute", "--git-path", "HEAD"],
			arcReplies: {},
			want: { stdout: "/arcadia/.arc/HEAD\n", code: 0 },
		},
		{
			name: "equals form from subdirectory",
			argv: ["rev-parse", "--path-format=absolute", "--git-path=HEAD"],
			cwd: "/arcadia/dir/sub",
			arcReplies: {},
			want: { stdout: "/arcadia/.arc/HEAD\n", code: 0 },
		},
	],
})
