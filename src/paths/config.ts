// git config against the SHIM-LOCAL store (per arc root) — never forwarded
// to arc config. Contract: orca must read back what it writes
// (push.autoSetupRemote, branch.<b>.*). Covers: set, --get, --get-regexp,
// --unset, --remove-section; --local is accepted and implied.
// `config --file <f> ...` (orca probes .gitmodules) → nothing is ever set in
// foreign files → --get exits 1 (unset), writes are refused.
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "config",
	summary: "shim-local config store (get/set/regexp/unset)",
	spec: "config --local? (--get|--get-regexp|--unset|--remove-section|--get-all)? --file=<file>? <key>? <value>?",
	// bare `config` with no key does nothing useful; require a key
	refine: (args) => args.pos.key !== undefined,

	async run(args, ctx) {
		const key = args.pos.key!
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
			let re: RegExp
			try {
				re = new RegExp(key)
			} catch {
				return fail(129, `error: invalid regexp '${key}'\n`)
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
			let removed = false
			for (const k of [...ctx.config.keys()])
				if (k === key || k.startsWith(key + ".")) {
					ctx.config.delete(k)
					removed = true
				}
			return removed ? ok() : fail(128, `fatal: no such section: ${key}\n`)
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
	],
})
