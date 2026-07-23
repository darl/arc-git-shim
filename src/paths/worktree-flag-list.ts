// git worktree --list — NOT a real git shape. Native git rejects it with
// "unknown option `list'" + the worktree usage block, exit 129 (`worktree`
// has no --list flag; the subcommand is `worktree list`). A learner once
// hallucinated this as a flag-form alias and made the shim ACCEPT it — which
// teaches AI callers fake git syntax that breaks in every real repo. The
// permanent answer is git's own rejection, byte-shaped.
import { definePath, fail } from "../core"

const USAGE =
	"error: unknown option `list'\n" +
	"usage: git worktree add [-f] [--detach] [--checkout] [--lock [--reason <string>]]\n" +
	"                        [--orphan] [(-b | -B) <new-branch>] <path> [<commit-ish>]\n" +
	"   or: git worktree list [-v | --porcelain [-z]]\n" +
	"   or: git worktree lock [--reason <string>] <worktree>\n" +
	"   or: git worktree move <worktree> <new-path>\n" +
	"   or: git worktree prune [-n] [-v] [--expire <expire>]\n" +
	"   or: git worktree remove [-f] <worktree>\n" +
	"   or: git worktree repair [<path>...]\n" +
	"   or: git worktree unlock <worktree>\n"

export default definePath({
	name: "worktree-flag-list",
	summary: "reject worktree --list like real git (unknown option, exit 129)",
	spec: "worktree --list --porcelain? -z?",

	async run() {
		return fail(129, USAGE)
	},

	fixtures: [
		{
			name: "bare --list rejected",
			argv: ["worktree", "--list"],
			arcReplies: {},
			want: { stdout: "", stderr: USAGE, code: 129 },
		},
		{
			name: "--list --porcelain rejected the same way",
			argv: ["worktree", "--list", "--porcelain"],
			arcReplies: {},
			want: { stdout: "", stderr: USAGE, code: 129 },
		},
		{
			name: "--list --porcelain -z rejected the same way",
			argv: ["worktree", "--list", "--porcelain", "-z"],
			arcReplies: {},
			want: { stdout: "", stderr: USAGE, code: 129 },
		},
	],
})
