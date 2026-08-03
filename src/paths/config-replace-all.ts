// git config --local --replace-all <key> <value>: replaces ALL values for a
// key with a single new value. The shim-local store (Map<string,string>)
// holds at most one value per key, so --replace-all is equivalent to a plain
// set. Same contract as the main config path: orca must read back what it
// writes; --local is accepted and implied.
import { configKey, definePath, ok } from "../core"

export default definePath({
	name: "config-replace-all",
	summary: "replace all values for a key in the shim-local config store",
	spec: "config --local? --replace-all <key> <value>",

	async run(args, ctx) {
		ctx.config.set(configKey(args.pos.key!), args.pos.value!)
		return ok()
	},

	fixtures: [
		{
			name: "replace-all writes key value",
			argv: ["config", "--local", "--replace-all", "orca.worktreeCreationBase", "arcadia/trunk"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "replace-all without --local",
			argv: ["config", "--replace-all", "push.autoSetupRemote", "true"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "replace-all overwrites existing value",
			argv: ["config", "--replace-all", "orca.worktreeCreationBase", "arcadia/trunk"],
			config: { "orca.worktreeCreationBase": "trunk" },
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
