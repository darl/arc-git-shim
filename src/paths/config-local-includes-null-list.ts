// The shim-local store has no external config files to expand; --includes
// therefore lists the same entries as the ordinary local config listing.
import { definePath, ok } from "../core"

export default definePath({
	name: "config-local-includes-null-list",
	summary: "list shim-local config with includes and NUL terminators",
	spec: "config --local --includes (-z|--null) --list",

	async run(_args, ctx) {
		const entries = [...ctx.config.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		return ok(entries.map(([key, value]) => `${key}\n${value}\0`).join(""))
	},

	fixtures: [
		{
			name: "local includes listing uses NUL-terminated records",
			argv: ["config", "--local", "--includes", "-z", "--list"],
			config: { "push.autoSetupRemote": "true", "branch.feature-x.remote": "arcadia" },
			arcReplies: {},
			want: { stdout: "branch.feature-x.remote\narcadia\0push.autosetupremote\ntrue\0", code: 0 },
		},
		{
			name: "empty listing with null alias",
			argv: ["config", "--list", "--null", "--includes", "--local"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
