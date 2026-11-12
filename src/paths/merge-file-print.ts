// merge-file operates on ordinary files, not repository state. Delegate to
// native git so conflict markers, exit counts, and errors remain exact.
import { definePath } from "../core"

export default definePath({
	name: "merge-file-print",
	summary: "three-way file merge to stdout using native git",
	spec: "merge-file -p <current> <base> <other>",

	async run(args, ctx) {
		return ctx.exec(["env", "ARC_GIT=off", "git", "merge-file", "-p", args.pos.current!, args.pos.base!, args.pos.other!])
	},

	fixtures: [
		{
			name: "clean merge",
			argv: ["merge-file", "-p", "mine.txt", "base.txt", "theirs.txt"],
			arcReplies: {},
			execReplies: {
				"env ARC_GIT=off git merge-file -p mine.txt base.txt theirs.txt": { stdout: "merged\n" },
			},
			want: { stdout: "merged\n", stderr: "", code: 0 },
		},
		{
			name: "conflict preserves markers and status",
			argv: ["merge-file", "-p", "mine", "base", "theirs"],
			arcReplies: {},
			execReplies: {
				"env ARC_GIT=off git merge-file -p mine base theirs": {
					stdout: "<<<<<<< mine\nmine\n=======\ntheirs\n>>>>>>> theirs\n",
					code: 1,
				},
			},
			want: { stdout: "<<<<<<< mine\nmine\n=======\ntheirs\n>>>>>>> theirs\n", stderr: "", code: 1 },
		},
		{
			name: "missing input propagates error",
			argv: ["merge-file", "-p", "missing", "base", "theirs"],
			arcReplies: {},
			execReplies: {
				"env ARC_GIT=off git merge-file -p missing base theirs": {
					stderr: "error: Could not stat missing: No such file or directory\n",
					code: 255,
				},
			},
			want: { stdout: "", stderr: "error: Could not stat missing: No such file or directory\n", code: 255 },
		},
	],
})
