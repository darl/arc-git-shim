// orca: diff [--cached|--staged] --name-status [-M] [-C] [-z] [<a> <b>].
// arc diff --cached --name-status prints git's exact "M\tpath" lines — direct
// passthrough. --staged is arc's own alias for --cached; we always hand arc
// --cached (the help confirms both mean "diff with index").
// -M/-C accepted and dropped (arc resolves moves only via an experimental
// flag; rename detection degrades to A+D pairs — structure stays valid).
// -z converts to NUL-terminated records without the tab (git -z name-status
// uses NUL after the status letter too: "M\0path\0").
// Positionals (explicit revs) are passed through without the merge-base /
// working-tree lens — --cached already pins the base, same as diff-cached-numstat.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-cached-name-status",
	summary: "name-status file list for staged changes via arc diff --cached --name-status",
	spec: "diff -z? (--cached|--staged) --name-status (-M|--find-renames)? (-C|--find-copies)? <a>? <b>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--cached", "--name-status"]
		if (args.pos.a !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.a, false)
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
			name: "staged modified and deleted (golden arc shape)",
			argv: ["diff", "--cached", "--name-status"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout:
						"M\tproj/subproj/tool/module/pipeline/legacy/ops/__init__.py\n" +
						"D\tproj/subproj/tool/module/pipeline/legacy/ops/legacy_convert_metrics.py\n" +
						"M\tproj/subproj/tool/module/pipeline/legacy/ops/ya.make\n",
				},
			},
			want: {
				stdout:
					"M\tproj/subproj/tool/module/pipeline/legacy/ops/__init__.py\n" +
					"D\tproj/subproj/tool/module/pipeline/legacy/ops/legacy_convert_metrics.py\n" +
					"M\tproj/subproj/tool/module/pipeline/legacy/ops/ya.make\n",
				code: 0,
			},
		},
		{
			name: "--staged alias",
			argv: ["diff", "--staged", "--name-status"],
			arcReplies: {
				"diff --cached --name-status": { stdout: "A\tbar.txt\nM\tfoo.go\n" },
			},
			want: { stdout: "A\tbar.txt\nM\tfoo.go\n", code: 0 },
		},
		{
			name: "-M -C accepted and dropped",
			argv: ["diff", "--cached", "--name-status", "-M", "-C"],
			arcReplies: {
				"diff --cached --name-status": { stdout: "M\tinfra/cli/cmd.go\n" },
			},
			want: { stdout: "M\tinfra/cli/cmd.go\n", code: 0 },
		},
		{
			name: "NUL-delimited staged name-status",
			argv: ["diff", "-z", "--cached", "--name-status"],
			arcReplies: {
				"diff --cached --name-status": { stdout: "M\tfoo/bar.go\nA\tbaz.txt\n" },
			},
			want: { stdout: "M\0foo/bar.go\0A\0baz.txt\0", code: 0 },
		},
		{
			name: "empty staged diff",
			argv: ["diff", "--cached", "--name-status"],
			arcReplies: { "diff --cached --name-status": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "NUL-delimited empty",
			argv: ["diff", "--cached", "--name-status", "-z"],
			arcReplies: { "diff --cached --name-status": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "staged name-status with explicit rev",
			argv: ["diff", "--cached", "--name-status", "HEAD~1"],
			arcReplies: {
				"diff --cached --name-status HEAD~1": { stdout: "M\tc.go\n" },
			},
			want: { stdout: "M\tc.go\n", code: 0 },
		},
		{
			name: "staged name-status with two explicit revs",
			argv: ["diff", "--cached", "--name-status", "HEAD~2", "HEAD~1"],
			arcReplies: {
				"diff --cached --name-status HEAD~2 HEAD~1": { stdout: "A\tnew.go\nD\told.go\n" },
			},
			want: { stdout: "A\tnew.go\nD\told.go\n", code: 0 },
		},
	],
})
