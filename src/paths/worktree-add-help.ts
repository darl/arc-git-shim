// Callers detect capabilities from help; omit locks until the shim can enforce them.
// Help takes precedence over trailing arguments and never creates a mount.
import { definePath } from "../core"

const USAGE =
	"usage: git worktree add [<options>] <path> [<commit-ish>]\n" +
	"   or: git worktree list [<options>]\n" +
	"   or: git worktree move <worktree> <new-path>\n" +
	"   or: git worktree prune [<options>]\n" +
	"   or: git worktree remove [<options>] <worktree>\n" +
	"\n" +
	"    -f, --force           checkout <branch> even if already checked out in other worktree\n" +
	"    -b <branch>           create a new branch\n" +
	"    -B <branch>           create or reset a branch\n" +
	"    -d, --detach          detach HEAD at named commit\n" +
	"    --checkout            populate the new working tree\n" +
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
		// Match Git's help output channel and exit code.
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
