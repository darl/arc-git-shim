// git config --null/--get with NUL-terminated output. --null (-z) changes the
// value terminator from \n to \0. Reads from the shim-local config store,
// same as the plain --get path. The --null flag is not in the base config
// path's spec, so shapes with --null fall through here.
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config-get-null",
	summary: "config --null/-z --get/--get-all with NUL terminator",
	spec: "config --local? (-z|--null) (--get|--get-all) <key>",

	async run(args, ctx) {
		const v = ctx.config.get(configKey(args.pos.key!))
		return v === undefined ? fail(1, "") : ok(`${v}\0`)
	},

	fixtures: [
		{
			name: "get existing with --null",
			argv: ["config", "--null", "--get", "core.fsmonitor"],
			config: { "core.fsmonitor": "true" },
			arcReplies: {},
			want: { stdout: "true\0", code: 0 },
		},
		{
			name: "get missing with --null exits 1",
			argv: ["config", "--null", "--get", "core.fsmonitor"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "get existing with -z short flag",
			argv: ["config", "-z", "--get", "core.fsmonitor"],
			config: { "core.fsmonitor": "true" },
			arcReplies: {},
			want: { stdout: "true\0", code: 0 },
		},
		{
			name: "get-all with --null",
			argv: ["config", "--null", "--get-all", "push.autoSetupRemote"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "true\0", code: 0 },
		},
		{
			name: "--local accepted with --null",
			argv: ["config", "--local", "--null", "--get", "push.autoSetupRemote"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "true\0", code: 0 },
		},
		{
			name: "--local get missing exits 1",
			argv: ["config", "--local", "-z", "--get", "no.such.key"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
	],
})
