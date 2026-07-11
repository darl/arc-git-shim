// git clean -ffdx and friends → arc clean. arc deletes by default (no -f
// needed); -d/-x/-n map directly. Combined-letter tokens are declared as
// literals — the strict parser has no combined-flag splitting.
import { definePath, ok } from "../core"

const has = (flags: Set<string>, letter: string): boolean =>
	[...flags].some((f) => !f.startsWith("--") && f.slice(1).includes(letter))

export default definePath({
	name: "clean",
	summary: "remove untracked files via arc clean",
	spec: "clean (-f|-ff|-fd|-fdx|-ffd|-ffdx|-fx|-df|-xdf)? -d? -x? (-n|--dry-run)? (-q|--quiet)? --? <paths...>?",

	async run(args, ctx) {
		// git refuses to clean without -f/-n; mirror that (exit 128)
		if (!has(args.flags, "f") && !has(args.flags, "n") && !args.flags.has("--dry-run"))
			return {
				stdout: "",
				stderr: "fatal: clean.requireForce defaults to true and neither -i, -n, nor -f given; refusing to clean\n",
				code: 128,
			}
		const arcArgs = ["clean"]
		if (has(args.flags, "d")) arcArgs.push("-d")
		if (has(args.flags, "x")) arcArgs.push("-x")
		if (has(args.flags, "n") || args.flags.has("--dry-run")) arcArgs.push("-n")
		if (has(args.flags, "q") || args.flags.has("--quiet")) arcArgs.push("-q")
		arcArgs.push(...(args.list.paths ?? []))
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "orca full clean -ffdx",
			argv: ["clean", "-ffdx"],
			arcReplies: { "clean -d -x": { stdout: "Removing junk/darl/tmp\n" } },
			want: { stdout: "Removing junk/darl/tmp\n", code: 0 },
		},
		{
			name: "dry run scoped to path",
			argv: ["clean", "-fd", "-n", "--", "junk"],
			arcReplies: { "clean -d -n junk": { stdout: "Would remove junk/x\n" } },
			want: { stdout: "Would remove junk/x\n", code: 0 },
		},
		{
			name: "no force flag → refuse like git",
			argv: ["clean", "-d"],
			arcReplies: {},
			want: { code: 128 },
		},
	],
})
