// git config --get-regex <pattern>: `--get-regex` is git's unique-prefix
// abbreviation of --get-regexp (git's parse-options accepts unambiguous
// option prefixes), so behavior is identical: print canonical "key value"
// lines for every stored key matching the regexp, exit 1 when nothing
// matches, exit 6 on an invalid pattern. The generic config path declares
// only the full spelling, so the abbreviated form needs its own spec.
// Pattern is matched raw (configKey would mangle the syntax) against
// canonical key names; hits print sorted like the --get-regexp path.
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "config-get-regex",
	summary: "abbreviated --get-regex lookup over the shim-local config store",
	spec: "config --local? --get-regex <pattern>",

	async run(args, ctx) {
		const pattern = args.pos.pattern!
		let re: RegExp
		try {
			re = new RegExp(pattern)
		} catch {
			// ret 6 is git-config's documented "invalid regexp" code
			return fail(6, `error: invalid key pattern: ${pattern}\n`)
		}
		// the store only ever holds canonical keys (writes and the harness
		// seed both canonicalize), so match the pattern raw against them
		const hits = [...ctx.config.entries()].filter(([k]) => re.test(k)).sort()
		if (!hits.length) return fail(1, "")
		return ok(hits.map(([k, v]) => `${k} ${v}\n`).join(""))
	},

	fixtures: [
		{
			name: "get-regex matches gk keys",
			argv: ["config", "--get-regex", "^branch\\..*\\.gk-"],
			config: {
				"branch.feature-x.gk-owner": "darl",
				"branch.feature-x.gk-reviewers": "alice bob",
				"branch.feature-x.remote": "arcadia",
			},
			arcReplies: {},
			want: {
				stdout: "branch.feature-x.gk-owner darl\nbranch.feature-x.gk-reviewers alice bob\n",
				code: 0,
			},
		},
		{
			name: "get-regex without --local",
			argv: ["config", "--get-regex", "^branch\\."],
			config: { "branch.feature-x.gk-owner": "darl" },
			arcReplies: {},
			want: { stdout: "branch.feature-x.gk-owner darl\n", code: 0 },
		},
		{
			name: "no matches exits 1 silently",
			argv: ["config", "--get-regex", "^nope\\."],
			config: { "branch.feature-x.gk-owner": "darl" },
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "invalid regexp exits 6 like git-config",
			argv: ["config", "--get-regex", "["],
			arcReplies: {},
			want: { stdout: "", stderr: "error: invalid key pattern: [\n", code: 6 },
		},
		{
			name: "pattern matches canonical (lowercased) key names",
			argv: ["config", "--get-regex", "^push\\..*remote"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "push.autosetupremote true\n", code: 0 },
		},
	],
})
