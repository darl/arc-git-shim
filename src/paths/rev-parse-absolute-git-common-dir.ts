// --path-format applies only to subsequent options, so retain their order.
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-absolute-git-common-dir",
	summary: "absolute common metadata directory",
	spec: "rev-parse --path-format=absolute *",

	refine(args) {
		const rest = args.list.rest ?? []
		return rest.length === 1 && rest[0] === "--git-common-dir"
	},

	async run(_args, ctx) {
		return ok(`${ctx.arcRoot === "/" ? "" : ctx.arcRoot}/.arc\n`)
	},

	fixtures: [
		{
			name: "absolute common directory at root",
			argv: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
			arcReplies: {},
			want: { stdout: "/arcadia/.arc\n", code: 0 },
		},
		{
			name: "absolute common directory from subdirectory",
			argv: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
			cwd: "/arcadia/dir/sub",
			arcReplies: {},
			want: { stdout: "/arcadia/.arc\n", code: 0 },
		},
	],
})
