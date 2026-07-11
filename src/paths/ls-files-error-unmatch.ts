// orca membership probe: ls-files --error-unmatch <path> — exit 0 tracked,
// exit 1 untracked (the exit code is the answer).
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "ls-files-error-unmatch",
	summary: "tracked-membership probe by exit code",
	spec: "ls-files --error-unmatch --? <path>",

	async run(args, ctx) {
		const r = await ctx.arc(["ls-files", args.pos.path!])
		if (r.code !== 0) return r
		if (r.stdout.trim() === "")
			return fail(1, `error: pathspec '${args.pos.path}' did not match any file(s) known to git\nDid you forget to 'git add'?\n`)
		return ok(r.stdout)
	},

	fixtures: [
		{
			name: "tracked file",
			argv: ["ls-files", "--error-unmatch", "README.md"],
			arcReplies: {
				"ls-files README.md": { stdout: "README.md\n" },
			},
			want: { stdout: "README.md\n", code: 0 },
		},
		{
			name: "untracked file exits 1",
			argv: ["ls-files", "--error-unmatch", "nope.txt"],
			arcReplies: {
				"ls-files nope.txt": { stdout: "" },
			},
			want: {
				stdout: "",
				stderr: "error: pathspec 'nope.txt' did not match any file(s) known to git\nDid you forget to 'git add'?\n",
				code: 1,
			},
		},
	],
})
