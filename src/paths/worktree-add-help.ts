// git worktree add --help (and -h) — a HELP request, not an add. Native git
// answers it with the worktree usage block on STDOUT and exit 129 (probed on
// git 2.34.1; -h is byte-identical), and the usage page wins over any later
// args: "--help extra", "--detach --help" and "--help <path>" all print the
// same block. AI callers ask this shape while exploring the shim — codified
// so it can never fall through to a real arc mutation.
//
// Shape notes:
// - The sibling worktree-flag-list embeds a NEWER git's usage text (--orphan,
//   repair line). This constant is byte-shaped to the git actually on this
//   host (2.34.1); the two blocks differ by design, each mirrors its git.
// - stdout (not stderr) carries the usage here; a bare `git worktree add`
//   prints it on stderr instead — a different ExecResult shape that must stay
//   learnable, so the spec declares only the --help/-h forms.
// - Refinement, not flags-in-spec: git's usage page wins over trailing args,
//   which `*?` models; refine() keeps worktree-add <path> (specificity tie,
//   resolved by refinement) falling through to the learning trigger.
//   One strict parse cannot also match help AFTER an undeclared arg (a
//   swallowed token can't be claimed later), so "--detach --help" stays
//   learnable; the spec covers every help-first shape, which is how callers
//   probe.
import { definePath } from "../core"

const USAGE =
	"usage: git worktree add [<options>] <path> [<commit-ish>]\n" +
	"   or: git worktree list [<options>]\n" +
	"   or: git worktree lock [<options>] <path>\n" +
	"   or: git worktree move <worktree> <new-path>\n" +
	"   or: git worktree prune [<options>]\n" +
	"   or: git worktree remove [<options>] <worktree>\n" +
	"   or: git worktree unlock <path>\n" +
	"\n" +
	"    -f, --force           checkout <branch> even if already checked out in other worktree\n" +
	"    -b <branch>           create a new branch\n" +
	"    -B <branch>           create or reset a branch\n" +
	"    -d, --detach          detach HEAD at named commit\n" +
	"    --checkout            populate the new working tree\n" +
	"    --lock                keep the new working tree locked\n" +
	"    --reason <string>     reason for locking\n" +
	"    -q, --quiet           suppress progress reporting\n" +
	"    --track               set up tracking mode (see git-branch(1))\n" +
	"    --guess-remote        try to match the new branch name with a remote-tracking branch\n" +
	"\n"

export default definePath({
	name: "worktree-add-help",
	summary: "usage block on stdout, exit 129 — help request beats add args",
	spec: "worktree add (--help|-h)? *?",

	refine: (args) => args.flags.has("--help") || args.flags.has("-h"),

	async run() {
		// byte-verified against native git: usage on stdout, empty stderr, 129
		return { stdout: USAGE, stderr: "", code: 129 }
	},

	fixtures: [
		{
			name: "--help prints usage on stdout, exit 129",
			argv: ["worktree", "add", "--help"],
			arcReplies: {},
			want: { stdout: USAGE, code: 129 },
		},
		{
			name: "-h is byte-identical",
			argv: ["worktree", "add", "-h"],
			arcReplies: {},
			want: { stdout: USAGE, code: 129 },
		},
		{
			name: "usage wins over a later positional",
			argv: ["worktree", "add", "--help", "dir/new-tree"],
			arcReplies: {},
			want: { stdout: USAGE, code: 129 },
		},
		{
			name: "usage wins over add flags after -h",
			argv: ["worktree", "add", "-h", "--detach"],
			arcReplies: {},
			want: { stdout: USAGE, code: 129 },
		},
	],
})
