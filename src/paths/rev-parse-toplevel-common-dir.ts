// orca calls: rev-parse --path-format=absolute --show-toplevel --git-common-dir
// git prints one line per requested value, in argument order: toplevel, common dir.
// The common dir for an arc mount is <root>/.arc (a real directory on mounts).
import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-toplevel-common-dir",
	summary: "toplevel + git-common-dir two-line combo (orca)",
	spec: "rev-parse --path-format=(absolute|relative)? --show-toplevel --git-common-dir",

	async run(_args, ctx) {
		return ok(`${ctx.arcRoot}\n${ctx.arcRoot}/.arc\n`)
	},

	fixtures: [
		{
			name: "absolute path format",
			argv: ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"],
			arcReplies: {},
			want: { stdout: "/arcadia\n/arcadia/.arc\n", code: 0 },
		},
		{
			name: "no path-format flag",
			argv: ["rev-parse", "--show-toplevel", "--git-common-dir"],
			arcReplies: {},
			want: { stdout: "/arcadia\n/arcadia/.arc\n", code: 0 },
		},
	],
})
