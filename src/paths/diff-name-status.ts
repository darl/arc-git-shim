// orca: diff --name-status -M -C <a> <b> [-z].
// GOLDEN: arc diff --name-status prints git's exact "M\tpath" lines.
// -M/-C accepted and dropped (arc resolves moves only via an experimental
// flag; rename detection degrades to A+D pairs — structure stays valid).
// -z converts to NUL-terminated records without the tab (git -z name-status
// uses NUL after the status letter too: "M\0path\0").
// A lone rev diffs the working tree from merge-base(rev, HEAD) — see
// expandDiffRev (acceptance finding: literal `diff trunk` drowns in fresh
// trunk commits); two explicit revs stay literal.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-name-status",
	summary: "name-status file list between two revs",
	spec: "diff --name-status -z? (-M|--find-renames)? (-C|--find-copies)? <a>? <b>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--name-status"]
		if (args.pos.a !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.a, args.pos.b === undefined)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		if (args.pos.b !== undefined) arcArgs.push(args.pos.b)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		if (!args.flags.has("-z")) return ok(r.stdout)
		const recs = r.stdout
			.split("\n")
			.filter(Boolean)
			.flatMap((l) => l.split("\t"))
		return ok(recs.length ? recs.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "two modified files (golden arc shape)",
			argv: ["diff", "--name-status", "-M", "-C", "HEAD~1", "HEAD"],
			arcReplies: {
				"diff --name-status HEAD~1 HEAD": {
					stdout: "M\tinfra/infractl/cli/commands/modify/delegate.go\nM\tinfra/infractl/webhooks/ytpool/validator.go\n",
				},
			},
			want: {
				stdout: "M\tinfra/infractl/cli/commands/modify/delegate.go\nM\tinfra/infractl/webhooks/ytpool/validator.go\n",
				code: 0,
			},
		},
		{
			name: "lone rev uses merge-base (trunk moves under you)",
			argv: ["diff", "--name-status", "trunk"],
			arcReplies: {
				"merge-base trunk HEAD": { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n" },
				"diff --name-status c79064cbea91ca389afe153a347d588452fe50df": { stdout: "M\tjunk/darl/x.txt\n" },
			},
			want: { stdout: "M\tjunk/darl/x.txt\n", code: 0 },
		},
		{
			name: "NUL-delimited",
			argv: ["diff", "--name-status", "-z", "a1b2c3", "d4e5f6"],
			arcReplies: {
				"diff --name-status a1b2c3 d4e5f6": { stdout: "M\tfoo/bar.go\nA\tbaz.txt\n" },
			},
			want: { stdout: "M\0foo/bar.go\0A\0baz.txt\0", code: 0 },
		},
	],
})
