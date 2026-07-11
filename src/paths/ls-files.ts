// git ls-files [-z] [--cached] [-- <paths>] — tracked files, cwd-relative
// (verified: arc ls-files is also cwd-relative). arc has no -z → shim
// converts newline list to NUL-terminated.
import { definePath, ok } from "../core"

export default definePath({
	name: "ls-files",
	summary: "tracked-file list, cwd-relative, optional NUL termination",
	spec: "ls-files -z? (-c|--cached)? --? <paths...>?",

	async run(args, ctx) {
		const r = await ctx.arc(["ls-files", ...(args.list.paths ?? [])])
		if (r.code !== 0) return r
		if (!args.flags.has("-z")) return ok(r.stdout)
		const files = r.stdout.split("\n").filter(Boolean)
		return ok(files.length ? files.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "plain list",
			argv: ["ls-files"],
			arcReplies: {
				"ls-files": { stdout: ".arcignore\nREADME.md\nsrc/main.go\n" },
			},
			want: { stdout: ".arcignore\nREADME.md\nsrc/main.go\n", code: 0 },
		},
		{
			name: "NUL-terminated with pathspec",
			argv: ["ls-files", "-z", "--", "src"],
			arcReplies: {
				"ls-files src": { stdout: "src/main.go\nsrc/util.go\n" },
			},
			want: { stdout: "src/main.go\0src/util.go\0", code: 0 },
		},
	],
})
