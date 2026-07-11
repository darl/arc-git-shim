// git branch -d/-D <branch...> → arc branch -d/-D.
import { definePath, ok } from "../core"

export default definePath({
	name: "branch-delete",
	summary: "delete branches via arc branch -d/-D",
	spec: "branch (-d|-D|--delete) <branches...>",

	async run(args, ctx) {
		const force = args.flags.has("-D")
		const out: string[] = []
		for (const b of args.list.branches!) {
			const r = await ctx.arc(["branch", force ? "-D" : "-d", b])
			if (r.code !== 0) return r
			out.push(r.stdout)
		}
		return ok(out.join(""))
	},

	fixtures: [
		{
			name: "safe delete",
			argv: ["branch", "-d", "feature-x"],
			arcReplies: { "branch -d feature-x": { stdout: "Deleted branch feature-x\n" } },
			want: { stdout: "Deleted branch feature-x\n", code: 0 },
		},
		{
			name: "force delete two",
			argv: ["branch", "-D", "a", "b"],
			arcReplies: {
				"branch -D a": { stdout: "Deleted branch a\n" },
				"branch -D b": { stdout: "Deleted branch b\n" },
			},
			want: { stdout: "Deleted branch a\nDeleted branch b\n", code: 0 },
		},
	],
})
