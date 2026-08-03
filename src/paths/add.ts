// git add — exit-code tier. arc add mirrors -A/--all and -u/--update.
import { definePath } from "../core"

export default definePath({
	name: "add",
	summary: "stage files via arc add",
	spec: "add (-A|--all)? (-u|--update)? (-f|--force)? -v? --? <paths...>?",
	// git needs something to stage: paths or a selection flag. -v/-f/-- alone
	// select nothing ("Nothing specified, nothing added.") — those shapes stay
	// learnable so the real git bytes get codified, not guessed.
	refine: (args) =>
		["-A", "--all", "-u", "--update"].some((f) => args.flags.has(f)) || (args.list.paths ?? []).length > 0,

	async run(args, ctx) {
		const arcArgs = ["add"]
		if (args.flags.has("-A") || args.flags.has("--all")) arcArgs.push("--all")
		if (args.flags.has("-u") || args.flags.has("--update")) arcArgs.push("--update")
		if (args.flags.has("-f") || args.flags.has("--force")) arcArgs.push("--force")
		arcArgs.push(...(args.list.paths ?? []))
		const r = await ctx.arc(arcArgs)
		return r
	},

	fixtures: [
		{
			name: "paths",
			argv: ["add", "foo.go", "bar/baz.txt"],
			arcReplies: { "add foo.go bar/baz.txt": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "-A all",
			argv: ["add", "-A"],
			arcReplies: { "add --all": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "failure propagates exit code",
			argv: ["add", "nope.txt"],
			arcReplies: { "add nope.txt": { stderr: "Error: no such file\n", code: 1 } },
			want: { code: 1 },
		},
	],
})
