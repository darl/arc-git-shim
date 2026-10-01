// git config -z --get-regexp <pattern>: like the plain --get-regexp path,
// but --null makes git terminate each "key value" record with NUL instead
// of newline — the byte shape is `key\nvalue\0` (newline still separates
// key from value; verified against real git output). Exit 1 when nothing
// matches, exit 6 on an invalid pattern, like the sibling config paths.
//
// The pattern is matched against canonical (lowercase) key names, and —
// matching real git, which compiles the pattern with REG_ICASE because key
// comparison itself is case-insensitive — the match is case-insensitive:
// `git config -z --get-regexp 'ALIAS\..*'` really does match alias.* keys.
//
// No collision: the generic config path declares no -z/--null token, and
// config-name-only-get-regexp requires --name-only, so this spec is the
// only match for `config -z --get-regexp …`.
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "config-null-get-regexp",
	summary: "NUL-terminated key/value regexp lookup over the shim-local config store",
	spec: "config --local? (-z|--null) --get-regexp <pattern>",

	async run(args, ctx) {
		const pattern = args.pos.pattern!
		let re: RegExp
		try {
			re = new RegExp(pattern, "i")
		} catch {
			// ret 6 is git-config's documented "invalid regexp" code
			return fail(6, `error: invalid key pattern: ${pattern}\n`)
		}
		// the store only ever holds canonical keys (writes and the harness
		// seed both canonicalize), so match the pattern raw against them
		const hits = [...ctx.config.entries()].filter(([k]) => re.test(k)).sort()
		if (!hits.length) return fail(1, "")
		return ok(hits.map(([k, v]) => `${k}\n${v}\0`).join(""))
	},

	fixtures: [
		{
			name: "alias entries as NUL-terminated key/value records",
			argv: ["config", "-z", "--get-regexp", "alias\\..*"],
			config: {
				"alias.co": "checkout",
				"alias.st": "status",
				"push.autoSetupRemote": "true",
			},
			arcReplies: {},
			want: { stdout: "alias.co\ncheckout\0alias.st\nstatus\0", code: 0 },
		},
		{
			name: "--null long spelling with --local",
			argv: ["config", "--local", "--null", "--get-regexp", "^branch\\."],
			config: {
				"branch.feature-x.merge": "refs/heads/feature-x",
				"branch.feature-x.remote": "arcadia",
			},
			arcReplies: {},
			want: {
				stdout: "branch.feature-x.merge\nrefs/heads/feature-x\0branch.feature-x.remote\narcadia\0",
				code: 0,
			},
		},
		{
			name: "match is case-insensitive like git (REG_ICASE)",
			argv: ["config", "-z", "--get-regexp", "ALIAS\\.ST"],
			config: { "alias.st": "status" },
			arcReplies: {},
			want: { stdout: "alias.st\nstatus\0", code: 0 },
		},
		{
			name: "no matches exits 1 silently",
			argv: ["config", "-z", "--get-regexp", "^nope\\."],
			config: { "alias.st": "status" },
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "invalid regexp exits 6 like git-config",
			argv: ["config", "-z", "--get-regexp", "["],
			arcReplies: {},
			want: { stdout: "", stderr: "error: invalid key pattern: [\n", code: 6 },
		},
	],
})
