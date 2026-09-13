// git config --system -z --get-all <key> (and the --get twin, with optional
// -z/--null): real git reads the machine-wide /etc/gitconfig here. Tooling
// probes safe.directory at --system scope to ask "is this repo trusted
// machine-wide"; on a machine where nothing was ever set there, git answers
// its documented "key not found" — exit 1, no output — and that unset
// signal is what the probe consumes. The shim has exactly one config store
// per arc root, and --global already reads it as a scope spelling
// (config-global-get-all); --system gets the same treatment, so callers
// read back what they wrote regardless of scope spelling. The store holds at
// most one value per key, so --get-all degenerates to --get; -z switches the
// value terminator from \n to \0 (verified: real git emits "val\0val\0" with
// no key names and no trailing newline).
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config-system-get-all",
	summary: "read a key from the shim-local config store with --system scope spelling",
	spec: "config --system (-z|--null)? (--get|--get-all) <key>",

	async run(args, ctx) {
		const v = ctx.config.get(configKey(args.pos.key!))
		if (v === undefined) return fail(1, "")
		return ok(args.flags.has("-z") || args.flags.has("--null") ? `${v}\0` : `${v}\n`)
	},

	fixtures: [
		{
			name: "unset system safe.directory exits 1 silently",
			argv: ["config", "--system", "-z", "--get-all", "safe.directory"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "get-all with -z NUL-terminates the value",
			argv: ["config", "--system", "-z", "--get-all", "safe.directory"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\0", code: 0 },
		},
		{
			name: "--get without -z newline-terminates",
			argv: ["config", "--system", "--get", "safe.directory"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\n", code: 0 },
		},
		{
			name: "--system reads back what --global wrote (one store, scope spellings)",
			argv: ["config", "--system", "--null", "--get-all", "maintenance.repo"],
			config: { "maintenance.repo": "/home/user/src/toolbox" },
			arcReplies: {},
			want: { stdout: "/home/user/src/toolbox\0", code: 0 },
		},
		{
			name: "key spelling variants hit the same entry (git canonicalization)",
			argv: ["config", "--system", "-z", "--get-all", "Safe.DIRECTORY"],
			config: { "safe.directory": "/home/user/work/repo" },
			arcReplies: {},
			want: { stdout: "/home/user/work/repo\0", code: 0 },
		},
		{
			name: "--get missing key exits 1",
			argv: ["config", "--system", "--get", "no.such.key"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
	],
})
