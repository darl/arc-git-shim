// Both values are printed in flag order; --show-cdup is empty at the root.
import { definePath, ok, relGitDir } from "../core"

export default definePath({
	name: "rev-parse-inside-work-tree-show-cdup",
	summary: "report work-tree membership and relative path to its root",
	spec: "rev-parse --is-inside-work-tree --show-cdup",

	async run(args, ctx) {
		const cdup = relGitDir(ctx).slice(0, -".arc".length)
		const lines = [...args.flags].map((flag) => flag === "--is-inside-work-tree" ? "true" : cdup)
		return ok(lines.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "root emits an empty cdup line",
			argv: ["rev-parse", "--is-inside-work-tree", "--show-cdup"],
			arcReplies: {},
			want: { stdout: "true\n\n", code: 0 },
		},
		{
			name: "nested directory emits one parent per level",
			argv: ["rev-parse", "--is-inside-work-tree", "--show-cdup"],
			cwd: "/arcadia/dir/sub",
			arcReplies: {},
			want: { stdout: "true\n../../\n", code: 0 },
		},
		{
			name: "reversed flags emit in requested order",
			argv: ["rev-parse", "--show-cdup", "--is-inside-work-tree"],
			cwd: "/arcadia/dir",
			arcReplies: {},
			want: { stdout: "../\ntrue\n", code: 0 },
		},
	],
})
