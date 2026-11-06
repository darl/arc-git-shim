import { definePath, fail } from "../core"

export default definePath({
	name: "rm-quiet",
	summary: "reject quiet rm without a pathspec",
	spec: "rm -q",

	async run() {
		return fail(128, "fatal: No pathspec was given. Which files should I remove?\n")
	},

	fixtures: [
		{
			name: "quiet rm requires a pathspec",
			argv: ["rm", "-q"],
			arcReplies: {},
			want: { stderr: "fatal: No pathspec was given. Which files should I remove?\n", code: 128 },
		},
	],
})
