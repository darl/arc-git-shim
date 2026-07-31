// orca: diff [--cached|--staged] --name-only [-z] [<a> <b>] plus the porcelain
// noise flags git/tools sprinkle (--no-ext-diff, --no-textconv, --color,
// --src-prefix, --dst-prefix, --no-renames). Those flags only shape the patch
// body; with --name-only they are no-ops, so we accept and drop them.
// GOLDEN: arc diff --cached --name-only prints git's exact "path\n" lines —
// direct passthrough. --staged is arc's own alias for --cached; we always hand
// arc --cached. -z converts newline records to NUL-terminated ("path\0path\0"),
// matching git's --name-only -z (no status letter, unlike --name-status -z).
// Positionals (explicit revs) are passed through without the merge-base /
// working-tree lens — --cached already pins the base, same as the other
// diff-cached-* paths.
import { definePath, expandDiffRev, isExecResult, ok } from "../core"

export default definePath({
	name: "diff-cached-name-only",
	summary: "name-only file list for staged changes via arc diff --cached --name-only",
	spec: "diff --no-ext-diff? --no-textconv? --color=<mode>? --src-prefix=<src>? --dst-prefix=<dst>? (--cached|--staged) --no-renames? --name-only -z? <a>? <b>?",

	async run(args, ctx) {
		const arcArgs = ["diff", "--cached", "--name-only"]
		if (args.pos.a !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.a, false)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		if (args.pos.b !== undefined) arcArgs.push(args.pos.b)
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r
		if (!args.flags.has("-z")) return ok(r.stdout)
		const recs = r.stdout.split("\n").filter(Boolean)
		return ok(recs.length ? recs.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "arriving shape: noise flags + rev + -z",
			argv: [
				"diff",
				"--no-ext-diff",
				"--no-textconv",
				"--color=never",
				"--src-prefix=a/",
				"--dst-prefix=b/",
				"--cached",
				"d5034714fd698d3c4beb305755d3dc18fc137b51",
				"--no-renames",
				"--name-only",
				"-z",
			],
			arcReplies: {
				"diff --cached --name-only d5034714fd698d3c4beb305755d3dc18fc137b51": {
					stdout: "infra/infractl/cli/commands/modify/delegate.go\ninfra/infractl/webhooks/ytpool/validator.go\n",
				},
			},
			want: {
				stdout:
					"infra/infractl/cli/commands/modify/delegate.go\x00infra/infractl/webhooks/ytpool/validator.go\x00",
				code: 0,
			},
		},
		{
			name: "staged name-only (golden arc shape, passthrough)",
			argv: ["diff", "--cached", "--name-only"],
			arcReplies: {
				"diff --cached --name-only": { stdout: "foo/bar.go\nbaz.txt\n" },
			},
			want: { stdout: "foo/bar.go\nbaz.txt\n", code: 0 },
		},
		{
			name: "--staged alias",
			argv: ["diff", "--staged", "--name-only"],
			arcReplies: {
				"diff --cached --name-only": { stdout: "x.txt\n" },
			},
			want: { stdout: "x.txt\n", code: 0 },
		},
		{
			name: "NUL-delimited staged name-only",
			argv: ["diff", "--cached", "--name-only", "-z"],
			arcReplies: {
				"diff --cached --name-only": { stdout: "foo/bar.go\nbaz.txt\n" },
			},
			want: { stdout: "foo/bar.go\x00baz.txt\x00", code: 0 },
		},
		{
			name: "noise flags without -z, no rev",
			argv: ["diff", "--no-ext-diff", "--no-textconv", "--color=never", "--cached", "--name-only"],
			arcReplies: {
				"diff --cached --name-only": { stdout: "a.go\n" },
			},
			want: { stdout: "a.go\n", code: 0 },
		},
		{
			name: "staged name-only with explicit rev",
			argv: ["diff", "--cached", "--name-only", "HEAD~1"],
			arcReplies: {
				"diff --cached --name-only HEAD~1": { stdout: "c.go\n" },
			},
			want: { stdout: "c.go\n", code: 0 },
		},
		{
			name: "staged name-only with two explicit revs",
			argv: ["diff", "--cached", "--name-only", "HEAD~2", "HEAD~1"],
			arcReplies: {
				"diff --cached --name-only HEAD~2 HEAD~1": { stdout: "new.go\nold.go\n" },
			},
			want: { stdout: "new.go\nold.go\n", code: 0 },
		},
		{
			name: "empty staged diff (no -z)",
			argv: ["diff", "--cached", "--name-only"],
			arcReplies: { "diff --cached --name-only": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "empty staged diff (-z)",
			argv: ["diff", "--cached", "--name-only", "-z"],
			arcReplies: { "diff --cached --name-only": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
	],
})
