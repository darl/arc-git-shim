// git config --local --unset-all <key>: removes ALL values for a key.
// The shim-local store (Map<string,string>) holds at most one value per
// key, so --unset-all is equivalent to a plain delete. Same contract as
// the main config path: orca must read back what it writes; --local is
// accepted and implied. Like git, exit 5 when the key was not set.
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config-unset-all",
	summary: "remove all values for a key in the shim-local config store",
	spec: "config --local? --unset-all <key>",

	async run(args, ctx) {
		if (!ctx.config.delete(configKey(args.pos.key!))) return fail(5, "")
		return ok()
	},

	fixtures: [
		{
			name: "unset-all removes existing key",
			argv: ["config", "--local", "--unset-all", "orca.worktreeCreationBase"],
			config: { "orca.worktreeCreationBase": "arcadia/trunk" },
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "unset-all without --local",
			argv: ["config", "--unset-all", "orca.worktreeCreationBase"],
			config: { "orca.worktreeCreationBase": "arcadia/trunk" },
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "unset-all missing key exits 5",
			argv: ["config", "--unset-all", "no.such.key"],
			arcReplies: {},
			want: { stdout: "", code: 5 },
		},
	],
})
