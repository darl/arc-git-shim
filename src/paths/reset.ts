// git reset [--hard|--soft|--mixed] [<ref>] [-- <paths...>] → arc reset
// mirrors the mode flags and [BRANCH] [PATH]... argument order.
import { definePath, ok } from "../core"

export default definePath({
	name: "reset",
	summary: "reset HEAD/index/worktree via arc reset",
	spec: "reset (--hard|--soft|--mixed)? (-q|--quiet)? <ref>? --? <paths...>?",
	// bare `reset` alone is valid (mixed to HEAD); refine nothing
	refine: (args) => !(args.pos.ref ?? "").includes(":"),

	async run(args, ctx) {
		const arcArgs = ["reset"]
		for (const f of ["--hard", "--soft", "--mixed"]) if (args.flags.has(f)) arcArgs.push(f)
		if (args.flags.has("-q") || args.flags.has("--quiet")) arcArgs.push("--quiet")
		if (args.pos.ref !== undefined) arcArgs.push(args.pos.ref)
		arcArgs.push(...(args.list.paths ?? []))
		const r = await ctx.arc(arcArgs)
		return r.code === 0 ? ok(r.stdout) : r
	},

	fixtures: [
		{
			name: "hard reset to ref",
			argv: ["reset", "--hard", "trunk"],
			arcReplies: { "reset --hard trunk": { stdout: "HEAD is now at c79064c\n" } },
			want: { stdout: "HEAD is now at c79064c\n", code: 0 },
		},
		{
			name: "soft reset one back",
			argv: ["reset", "--soft", "HEAD~1"],
			arcReplies: { "reset --soft HEAD~1": {} },
			want: { stdout: "", code: 0 },
		},
		{
			name: "unstage via reset HEAD -- path",
			argv: ["reset", "HEAD", "--", "a.txt"],
			arcReplies: { "reset HEAD a.txt": {} },
			want: { stdout: "", code: 0 },
		},
	],
})
