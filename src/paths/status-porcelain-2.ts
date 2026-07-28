// git accepts both --porcelain=v2 and --porcelain=2 (the "v" prefix is
// optional); the spec engine treats them as distinct literals, so the
// existing status-porcelain-v2 path (spec "status --porcelain=v2 …") does
// not match "--porcelain=2".  This path mirrors that spec with the bare
// numeric form and delegates to the same run() — the porcelain format
// flag is purely a matcher concern; run() never inspects it.
import v2Path from "./status-porcelain-v2"
import { definePath } from "../core"

const Z40 = "0".repeat(40)

export default definePath({
	name: "status-porcelain-2",
	summary: "porcelain v2 (numeric --porcelain=2 alias) with branch headers",
	spec: "status --porcelain=2 --branch? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	run: v2Path.run,

	fixtures: [
		{
			name: "orca poll via numeric alias: branch headers + staged + untracked",
			argv: ["status", "--porcelain=2", "--branch", "--untracked-files=all"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}',
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..HEAD": { stdout: "aaa\nbbb\n" },
				"log --format={commit} -n 1000 HEAD..arcadia/users/darl/feature-x": { stdout: "" },
				"status --json -u all": {
					stdout:
						'{"status":{"staged":[{"status":"new file","type":"file","path":"junk/darl/new.txt"}],"untracked":[{"status":"untracked","type":"file","path":"junk/darl/scratch.txt"}]}}',
				},
			},
			want: {
				stdout:
					"# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\n" +
					"# branch.head feature-x\n" +
					"# branch.upstream arcadia/users/darl/feature-x\n" +
					"# branch.ab +2 -0\n" +
					`1 A. N... 100644 100644 100644 ${Z40} ${Z40} junk/darl/new.txt\n` +
					"? junk/darl/scratch.txt\n",
				code: 0,
			},
		},
		{
			name: "numeric alias, no branch flag, clean tree",
			argv: ["status", "--porcelain=2"],
			arcReplies: {
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout: "",
				code: 0,
			},
		},
		{
			name: "numeric alias with --branch, no upstream",
			argv: ["status", "--porcelain=2", "--branch"],
			arcReplies: {
				"info --json": {
					stdout: '{"branch":"local-only","hash":"c79064cbea91ca389afe153a347d588452fe50df"}',
				},
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout:
					"# branch.oid c79064cbea91ca389afe153a347d588452fe50df\n" +
					"# branch.head local-only\n",
				code: 0,
			},
		},
	],
})
