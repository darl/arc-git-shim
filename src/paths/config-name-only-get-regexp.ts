// git config --name-only --get-regexp <pattern>
// Outputs only the names (no values) of config variables whose key matches
// the regexp, one per line. Exit 1 when nothing matches. The shim-local
// config store is searched (same store as the general config path), never
// forwarded to arc.
//
// --name-only is a required flag distinct from the general `config` path
// (which does not declare it), so there is no dispatch collision: this path
// is strictly more specific.
import { definePath, fail, ok } from "../core"

export default definePath({
	name: "config-name-only-get-regexp",
	summary: "list matching config key names via regexp (shim-local store)",
	spec: "config --local? --name-only --get-regexp <pattern>",

	async run(args, ctx) {
		const pattern = args.pos.pattern!
		let re: RegExp
		try {
			re = new RegExp(pattern)
		} catch {
			return fail(6, `error: invalid key pattern: ${pattern}\n`)
		}
		const hits = [...ctx.config.entries()]
			.filter(([k]) => re.test(k))
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		if (!hits.length) return fail(1, "")
		return ok(hits.map(([k]) => `${k}\n`).join(""))
	},

	fixtures: [
		{
			name: "matching filter keys output names only",
			argv: ["config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"],
			config: {
				"filter.lfs.clean": "git-lfs clean -- %f",
				"filter.lfs.smudge": "git-lfs smudge -- %f",
				"push.autoSetupRemote": "true",
			},
			arcReplies: {},
			want: {
				stdout: "filter.lfs.clean\nfilter.lfs.smudge\n",
				code: 0,
			},
		},
		{
			name: "no matches exits 1 silently",
			argv: ["config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"],
			config: { "push.autoSetupRemote": "true" },
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "with --local accepted",
			argv: ["config", "--local", "--name-only", "--get-regexp", "^branch\\."],
			config: {
				"branch.feature-x.remote": "arcadia",
				"branch.feature-x.merge": "refs/heads/feature-x",
			},
			arcReplies: {},
			want: {
				stdout: "branch.feature-x.merge\nbranch.feature-x.remote\n",
				code: 0,
			},
		},
		{
			name: "invalid regexp exits 6 like git",
			argv: ["config", "--name-only", "--get-regexp", "^[invalid"],
			arcReplies: {},
			want: { stdout: "", stderr: "error: invalid key pattern: ^[invalid\n", code: 6 },
		},
	],
})
