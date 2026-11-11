// Arc has no separate worktree config; like git without worktreeConfig,
// --worktree reads the local store. There are no external includes to expand.
import { definePath, ok } from "../core"

export default definePath({
	name: "config-worktree-includes-null-list",
	summary: "list worktree config with includes and NUL terminators",
	spec: "config --worktree --includes (-z|--null) --list",

	async run(_args, ctx) {
		const entries = [...ctx.config.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		return ok(entries.map(([key, value]) => `${key}\n${value}\0`).join(""))
	},

	fixtures: [
		{
			name: "worktree listing uses NUL-terminated records",
			argv: ["config", "--worktree", "--includes", "-z", "--list"],
			config: { "push.autoSetupRemote": "true", "branch.feature-x.remote": "arcadia" },
			arcReplies: {},
			want: { stdout: "branch.feature-x.remote\narcadia\0push.autosetupremote\ntrue\0", code: 0 },
		},
		{
			name: "empty listing with null alias and reordered flags",
			argv: ["config", "--list", "--null", "--includes", "--worktree"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
