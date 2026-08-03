// git config against the SHIM-LOCAL store (per arc root) — never forwarded
// to arc config. Contract: orca must read back what it writes
// (push.autoSetupRemote, branch.<b>.*). Covers: set, --get, --get-regexp,
// --unset, --remove-section; --local is accepted and implied.
// Keys canonicalize like git's (configKey: section+variable lowercased), so
// spelling variants hit the same entry and --list prints lowercase names.
// `config --file <f> ...` (orca probes .gitmodules) → nothing is ever set in
// foreign files → --get exits 1 (unset), writes are refused.
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config",
	summary: "shim-local config store (get/set/regexp/unset)",
	spec: "config --local? (--get|--get-regexp|--unset|--remove-section|--get-all)? --file=<file>? <key>? <value>?",
	// bare `config` with no key does nothing useful; require a key.
	// A trailing <value> next to a read/unset flag is git's value-pattern
	// filter, which the shim doesn't implement — those shapes stay learnable
	// instead of silently ignoring the pattern.
	refine: (args) =>
		args.pos.key !== undefined &&
		(args.pos.value === undefined ||
			!["--get", "--get-all", "--get-regexp", "--unset", "--remove-section"].some((f) => args.flags.has(f))),

	async run(args, ctx) {
		const key = configKey(args.pos.key!)
		if (args.pos.file !== undefined) {
			// foreign config files (e.g. .gitmodules) are always empty here
			if (args.flags.has("--get") || args.flags.has("--get-regexp") || args.flags.has("--get-all"))
				return fail(1, "")
			return fail(128, `fatal: arc-git: writing to config file '${args.pos.file}' is not supported\n`)
		}
		if (args.flags.has("--get") || args.flags.has("--get-all")) {
			const v = ctx.config.get(key)
			return v === undefined ? fail(1, "") : ok(`${v}\n`)
		}
		if (args.flags.has("--get-regexp")) {
			// the argument is a regexp matched against canonical key names —
			// use it raw (configKey would mangle pattern syntax)
			const pattern = args.pos.key!
			let re: RegExp
			try {
				re = new RegExp(pattern)
			} catch {
				// ret 6 is git-config's documented "invalid regexp" code
				return fail(6, `error: invalid key pattern: ${pattern}\n`)
			}
			const hits = [...ctx.config.entries()].filter(([k]) => re.test(k)).sort()
			if (!hits.length) return fail(1, "")
			return ok(hits.map(([k, v]) => `${k} ${v}\n`).join(""))
		}
		if (args.flags.has("--unset")) {
			if (!ctx.config.delete(key)) return fail(5, "")
			return ok()
		}
		if (args.flags.has("--remove-section")) {
			// the argument is section[.subsection]: only the SECTION half is
			// case-insensitive (configKey would wrongly lowercase a subsection)
			const parts = args.pos.key!.split(".")
			const section = [parts[0]!.toLowerCase(), ...parts.slice(1)].join(".")
			let removed = false
			for (const k of [...ctx.config.keys()])
				if (k === section || k.startsWith(section + ".")) {
					ctx.config.delete(k)
					removed = true
				}
			return removed ? ok() : fail(128, `fatal: no such section: ${section}\n`)
		}
		if (args.pos.value !== undefined) {
			ctx.config.set(key, args.pos.value)
			return ok()
		}
		// `config <key>` reads like --get
		const v = ctx.config.get(key)
		return v === undefined ? fail(1, "") : ok(`${v}\n`)
	},

	fixtures: [
		{
			name: "set then read back shape",
			argv: ["config", "--local", "push.autoSetupRemote", "true"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "get existing",
			argv: ["config", "--get", "push.autoSetupRemote"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "true\n", code: 0 },
		},
		{
			name: "get missing exits 1 silently",
			argv: ["config", "--get", "no.such.key"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "get-regexp over branch section",
			argv: ["config", "--get-regexp", "^branch\\.feature-x\\."],
			config: { "branch.feature-x.remote": "arcadia", "branch.feature-x.merge": "refs/heads/feature-x" },
			arcReplies: {},
			want: {
				stdout: "branch.feature-x.merge refs/heads/feature-x\nbranch.feature-x.remote arcadia\n",
				code: 0,
			},
		},
		{
			name: "gitmodules probe exits 1",
			argv: ["config", "--file", ".gitmodules", "--get", "submodule.x.url"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "remove-section",
			argv: ["config", "--remove-section", "branch.feature-x"],
			config: { "branch.feature-x.remote": "arcadia" },
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "key spelling variants hit the same entry (git canonicalization)",
			argv: ["config", "--get", "push.AUTOSETUPREMOTE"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "true\n", code: 0 },
		},
		{
			name: "invalid regexp exits 6 like git-config",
			argv: ["config", "--get-regexp", "["],
			arcReplies: {},
			want: { stdout: "", stderr: "error: invalid key pattern: [\n", code: 6 },
		},
	],
})
