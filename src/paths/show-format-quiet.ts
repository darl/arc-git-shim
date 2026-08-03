// git show --format=<fmt> (-q|--quiet) [<rev>] [--] — commit metadata only,
// diff suppressed by -q/--quiet.  Equivalent to `git log -1 --format=<fmt>
// <rev>`: arc log --json yields one commit, rendered through the git
// %-placeholder engine from src/gitlog.ts.  Without --quiet git also emits
// the diff — a different, more complex shape left learnable.
import { arcJson, arcRev, badRevision, definePath, isExecResult, ok } from "../core"
import { joinRendered, type LogEntry, renderCommit, renderable, splitPretty } from "../gitlog"

export default definePath({
	name: "show-format-quiet",
	summary: "show commit metadata via %-format with diff suppressed",
	spec: "show (--format|--pretty)=<fmt> (-q|--quiet) <rev>? --?",
	refine: (args) => renderable(splitPretty(args.pos.fmt!).fmt),

	async run(args, ctx) {
		const { fmt, terminator } = splitPretty(args.pos.fmt!)
		const rev = args.pos.rev ?? "HEAD"
		const entries = await arcJson<LogEntry[]>(ctx, ["log", "--json", "-n", "1", arcRev(rev)])
		if (isExecResult(entries)) return entries
		if (entries.length === 0) return badRevision(rev)
		return ok(joinRendered(entries.map((e) => renderCommit(fmt, e)), terminator))
	},

	fixtures: [
		{
			name: "full hash of HEAD with --quiet and --",
			argv: ["show", "--format=%H", "HEAD", "--quiet", "--"],
			arcReplies: {
				"log --json -n 1 HEAD": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"subject one"}]',
				},
			},
			want: { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0\n", code: 0 },
		},
		{
			name: "subject via -q without --",
			argv: ["show", "-q", "--format=%s", "HEAD"],
			arcReplies: {
				"log --json -n 1 HEAD": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"fix the widget\\n\\nbody text"}]',
				},
			},
			want: { stdout: "fix the widget\n", code: 0 },
		},
		{
			name: "no rev defaults to HEAD",
			argv: ["show", "--pretty=%H", "--quiet"],
			arcReplies: {
				"log --json -n 1 HEAD": {
					stdout:
						'[{"commit":"c79064cbea91ca389afe153a347d588452fe50df","author":"darl","date":"2026-07-01T10:00:00+03:00","message":"another commit"}]',
				},
			},
			want: { stdout: "c79064cbea91ca389afe153a347d588452fe50df\n", code: 0 },
		},
		{
			name: "format: prefix suppresses trailing newline",
			argv: ["show", "--format=format:%H", "--quiet", "HEAD"],
			arcReplies: {
				"log --json -n 1 HEAD": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"m"}]',
				},
			},
			want: { stdout: "a7819db772eed4b7b5a49b558b22f185464b80a0", code: 0 },
		},
		{
			name: "bad revision is git-shaped fatal",
			argv: ["show", "--format=%H", "--quiet", "no-such-rev"],
			arcReplies: {
				"log --json -n 1 no-such-rev": { stdout: "[]" },
			},
			want: {
				stderr:
					"fatal: ambiguous argument 'no-such-rev': unknown revision or path not in the working tree.\n" +
					"Use '--' to separate paths from revisions, like this:\n" +
					"'git <command> [<revision>...] -- [<file>...]'\n",
				code: 128,
			},
		},
		{
			name: "author name with branch rev",
			argv: ["show", "--format=%an", "--quiet", "users/darl/feature-x"],
			arcReplies: {
				"log --json -n 1 users/darl/feature-x": {
					stdout:
						'[{"commit":"a7819db772eed4b7b5a49b558b22f185464b80a0","author":"darl","date":"2026-06-30T23:53:19+03:00","message":"add feature"}]',
				},
			},
			want: { stdout: "darl\n", code: 0 },
		},
	],
})
