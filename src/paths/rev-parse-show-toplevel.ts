import { definePath, ok } from "../core"

export default definePath({
	name: "rev-parse-show-toplevel",
	summary: "print the arc working-tree root",
	spec: "rev-parse --show-toplevel",

	async run(_args, ctx) {
		return ok(`${ctx.arcRoot}\n`)
	},

	fixtures: [
		{
			name: "toplevel is arc root",
			argv: ["rev-parse", "--show-toplevel"],
			arcReplies: {},
			want: { stdout: "/arcadia\n", code: 0 },
		},
	],
})
