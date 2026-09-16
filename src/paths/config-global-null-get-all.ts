// git config --global -z/--null --get-all <key> (and the --get twin): real
// git reads all values of a multi-valued key from ~/.gitconfig with values
// NUL-terminated (verified: "val\0val\0" — no key names, no trailing
// newline; missing key → exit 1, silent). Tooling probes safe.directory at
// --global scope to ask "is this repo trusted by this user"; on a machine
// where nothing was ever set there, git answers its documented "key not
// found" — exit 1, no output — and that unset signal is what the probe
// consumes. The shim has exactly one config store per arc root; --local and
// --system already read it as scope spellings (config-get-null,
// config-system-get-all), and --global --get-all without -z is handled by
// config-global-get-all — so this path declares -z/--null REQUIRED: the
// no-null shape must keep dispatching there, and an optional token here
// would tie specificity on it (a codegen-time collision).
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config-global-null-get-all",
	summary: "config --global -z/--null --get/--get-all from the shim-local config store",
	spec: "config --global (-z|--null) (--get|--get-all) <key>",

	async run(args, ctx) {
		const v = ctx.config.get(configKey(args.pos.key!))
		if (v === undefined) return fail(1, "")
		return ok(args.flags.has("-z") || args.flags.has("--null") ? `${v}\0` : `${v}\n`)
	},

	fixtures: [
		{
			name: "unset global safe.directory exits 1 silently",
			argv: ["config", "--global", "-z", "--get-all", "safe.directory"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "get-all with -z NUL-terminates the value",
			argv: ["config", "--global", "-z", "--get-all", "safe.directory"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\0", code: 0 },
		},
		{
			name: "--get with --null reads the same store",
			argv: ["config", "--global", "--null", "--get", "safe.directory"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\0", code: 0 },
		},
		{
			name: "--global reads back what --local wrote (one store, scope spellings)",
			argv: ["config", "--global", "--null", "--get-all", "maintenance.repo"],
			config: { "maintenance.repo": "/home/user/src/toolbox" },
			arcReplies: {},
			want: { stdout: "/home/user/src/toolbox\0", code: 0 },
		},
		{
			name: "key spelling variants hit the same entry (git canonicalization)",
			argv: ["config", "--global", "-z", "--get-all", "Safe.DIRECTORY"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\0", code: 0 },
		},
	],
})
