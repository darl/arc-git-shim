// git branch -d/-D <branch...> → arc branch -d/-D.
// git deletes what it can: a failing branch reports on stderr and the loop
// continues; exit 1 at the end if anything failed.
import { definePath } from "../core"

export default definePath({
	name: "branch-delete",
	summary: "delete branches via arc branch -d/-D",
	spec: "branch (-d|-D|--delete) <branches...>",

	async run(args, ctx) {
		const force = args.flags.has("-D")
		let stdout = ""
		let stderr = ""
		let failed = false
		for (const b of args.list.branches!) {
			const r = await ctx.arc(["branch", force ? "-D" : "-d", b])
			stdout += r.stdout
			stderr += r.stderr
			if (r.code !== 0) failed = true
		}
		return { stdout, stderr, code: failed ? 1 : 0 }
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
		{
			name: "one failure does not stop the rest (git deletes what it can)",
			argv: ["branch", "-d", "gone", "feature-x"],
			arcReplies: {
				"branch -d gone": { stderr: "error: branch gone not found\n", code: 1 },
				"branch -d feature-x": { stdout: "Deleted branch feature-x\n" },
			},
			want: { stdout: "Deleted branch feature-x\n", stderr: "error: branch gone not found\n", code: 1 },
		},
	],
})
