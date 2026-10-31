// Each rev-parse query emits its result in argv order. The common directory
// is relative to the invocation directory unless a path format is requested.
import { definePath, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-inside-work-tree-toplevel-common-dir",
	summary: "work-tree status, toplevel and common directory",
	spec: "rev-parse --is-inside-work-tree --show-toplevel --git-common-dir",

	async run(args, ctx) {
		const lines = [...args.flags].map((flag) => {
			if (flag === "--is-inside-work-tree") return "true"
			if (flag === "--show-toplevel") return ctx.arcRoot
			return relGitDir(ctx)
		})
		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "queries at root",
			argv: ["rev-parse", "--is-inside-work-tree", "--show-toplevel", "--git-common-dir"],
			arcReplies: {},
			want: { stdout: "true\n/arcadia\n.arc\n", code: 0 },
		},
		{
			name: "reordered queries from a nested directory",
			argv: ["rev-parse", "--git-common-dir", "--show-toplevel", "--is-inside-work-tree"],
			cwd: "/arcadia/dir/sub",
			arcReplies: {},
			want: { stdout: "../../.arc\n/arcadia\ntrue\n", code: 0 },
		},
	],
})
