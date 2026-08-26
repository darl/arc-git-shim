// git config --list --name-only: list every key NAME (no values) in the
// shim-local store. With -z/--null the terminator is NUL instead of newline.
// The existing config-list path (spec "config --local? --list (-z|--null)?")
// does not declare --name-only, so this shape falls through to here — no
// dispatch collision (specificity 3 > config-list's 2, and config-list
// rejects the undeclared --name-only flag outright).
import { definePath, ok } from "../core"

export default definePath({
	name: "config-list-name-only",
	summary: "list all shim-local config key names (newline or NUL terminated)",
	spec: "config --local? --list --name-only (-z|--null)?",

	async run(args, ctx) {
		const keys = [...ctx.config.keys()].sort()
		const sep = args.flags.has("-z") || args.flags.has("--null") ? "\0" : "\n"
		return ok(keys.map((k) => k + sep).join(""))
	},

	fixtures: [
		{
			name: "name-only list with newline separators",
			argv: ["config", "--list", "--name-only"],
			config: { "push.autoSetupRemote": "true", "branch.main.remote": "arcadia" },
			arcReplies: {},
			want: {
				stdout: "branch.main.remote\npush.autosetupremote\n",
				code: 0,
			},
		},
		{
			name: "name-only list with -z null terminators",
			argv: ["config", "-z", "--list", "--name-only"],
			config: { "push.autoSetupRemote": "true", "branch.main.remote": "arcadia" },
			arcReplies: {},
			want: {
				stdout: "branch.main.remote\0push.autosetupremote\0",
				code: 0,
			},
		},
		{
			name: "name-only list with --null alias",
			argv: ["config", "--list", "--name-only", "--null"],
			config: { "user.email": "claude@claude.ai" },
			arcReplies: {},
			want: {
				stdout: "user.email\0",
				code: 0,
			},
		},
		{
			name: "empty store name-only lists nothing",
			argv: ["config", "--list", "--name-only"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "empty store name-only with -z lists nothing",
			argv: ["config", "-z", "--list", "--name-only"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "with --local accepted",
			argv: ["config", "--local", "--list", "--name-only"],
			config: { "branch.feature-x.remote": "arcadia", "branch.feature-x.merge": "refs/heads/feature-x" },
			arcReplies: {},
			want: {
				stdout: "branch.feature-x.merge\nbranch.feature-x.remote\n",
				code: 0,
			},
		},
	],
})
