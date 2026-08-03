// git config --list dumps every key-value pair in the shim-local store.
// With -z/--null the entry separator changes: instead of "key=value\n" per
// entry, each entry is "key\nvalue\0" (key and value split by a newline,
// entry terminated by NUL, no trailing newline). Sourced from ctx.config
// — never forwarded to arc config (same contract as the main config path).
import { definePath, ok } from "../core"

export default definePath({
	name: "config-list",
	summary: "list all shim-local config entries (newline or NUL terminated)",
	spec: "config --local? --list (-z|--null)?",

	async run(args, ctx) {
		const entries = [...ctx.config.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		const nullSep = args.flags.has("-z") || args.flags.has("--null")
		if (nullSep) return ok(entries.map(([k, v]) => `${k}\n${v}\0`).join(""))
		return ok(entries.map(([k, v]) => `${k}=${v}\n`).join(""))
	},

	fixtures: [
		{
			name: "list with newline separators",
			argv: ["config", "--list"],
			config: { "push.autoSetupRemote": "true", "branch.main.remote": "arcadia" },
			arcReplies: {},
			want: {
				stdout: "branch.main.remote=arcadia\npush.autosetupremote=true\n",
				code: 0,
			},
		},
		{
			name: "list with -z null terminators",
			argv: ["config", "--list", "-z"],
			config: { "push.autoSetupRemote": "true", "branch.main.remote": "arcadia" },
			arcReplies: {},
			want: {
				stdout: "branch.main.remote\narcadia\0push.autosetupremote\ntrue\0",
				code: 0,
			},
		},
		{
			name: "list with --null alias",
			argv: ["config", "--list", "--null"],
			config: { "user.email": "claude@claude.ai" },
			arcReplies: {},
			want: {
				stdout: "user.email\nclaude@claude.ai\0",
				code: 0,
			},
		},
		{
			name: "empty store lists nothing",
			argv: ["config", "--list"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "empty store with -z lists nothing",
			argv: ["config", "--list", "-z"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
	],
})
