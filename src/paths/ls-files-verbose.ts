// git ls-files -v — tracked files with a status tag letter per line
// ("H <path>"). Tags exist to expose assume-unchanged (lowercase) and
// skip-worktree ("S") files; arc has neither concept, so every cached file
// is a normal "H". Verified shapes: -v prints "H <path>\n" per file, -v -z
// prints "H <path>\0" per file with no newline, pathspecs filter as usual.
import { definePath, ok } from "../core"

export default definePath({
	name: "ls-files-verbose",
	summary: "tracked-file list with per-file tag letters (all H — arc has no assume-unchanged)",
	spec: "ls-files -v -z? (-c|--cached)? --? <paths...>?",

	async run(args, ctx) {
		const arcArgs = ["ls-files"]
		if (args.flags.has("-c") || args.flags.has("--cached")) arcArgs.push("-c")
		arcArgs.push(...(args.list.paths ?? []))
		const r = await ctx.arc(arcArgs)
		if (r.code !== 0) return r
		const files = r.stdout.split("\n").filter(Boolean).map((f) => `H ${f}`)
		if (args.flags.has("-z")) return ok(files.length ? files.join("\0") + "\0" : "")
		return ok(files.length ? files.join("\n") + "\n" : "")
	},

	fixtures: [
		{
			name: "plain tag list",
			argv: ["ls-files", "-v"],
			arcReplies: {
				"ls-files": { stdout: ".arcignore\ndir/sub/file.txt\nreadme.md\n" },
			},
			want: { stdout: "H .arcignore\nH dir/sub/file.txt\nH readme.md\n", code: 0 },
		},
		{
			name: "NUL-terminated tags",
			argv: ["ls-files", "-v", "-z"],
			arcReplies: {
				"ls-files": { stdout: "dir/sub/file.txt\nreadme.md\n" },
			},
			want: { stdout: "H dir/sub/file.txt\0H readme.md\0", code: 0 },
		},
		{
			name: "cached flag and pathspec forwarded",
			argv: ["ls-files", "-v", "-c", "--", "src"],
			arcReplies: {
				"ls-files -c src": { stdout: "src/main.ts\n" },
			},
			want: { stdout: "H src/main.ts\n", code: 0 },
		},
		{
			name: "no tracked files, empty output",
			argv: ["ls-files", "-v"],
			arcReplies: {
				"ls-files": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
	],
})
