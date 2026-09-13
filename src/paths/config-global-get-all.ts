// git config --global --get-all <key> (and its twin --get): git reads all
// values of a multi-valued key from ~/.gitconfig. The shim has exactly one
// config store per arc root — --local is already accepted-and-implied in
// this family, and --global gets the same treatment: a scope spelling over
// the same store. The store holds at most one value per key, so --get-all
// degenerates to --get. Nothing ever writes maintenance.* through the shim,
// so the common case answers exactly like real git on a machine where the
// global key is unset: exit 1, no output (git maintenance probes rely on
// that "not registered" signal).
import { configKey, definePath, fail, ok } from "../core"

export default definePath({
	name: "config-global-get-all",
	summary: "read a key from the shim-local config store with --global scope spelling",
	spec: "config --global (--get|--get-all) <key>",

	async run(args, ctx) {
		const v = ctx.config.get(configKey(args.pos.key!))
		// unset key: git-config's documented "key not found" — exit 1, silent
		return v === undefined ? fail(1, "") : ok(`${v}\n`)
	},

	fixtures: [
		{
			name: "unset global key exits 1 silently",
			argv: ["config", "--global", "--get-all", "maintenance.repo"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "get-all returns the stored value",
			argv: ["config", "--global", "--get-all", "maintenance.repo"],
			config: { "maintenance.repo": "/home/user/src/toolbox" },
			arcReplies: {},
			want: { stdout: "/home/user/src/toolbox\n", code: 0 },
		},
		{
			name: "--get variant reads the same store",
			argv: ["config", "--global", "--get", "maintenance.repo"],
			config: { "maintenance.repo": "/home/user/src/toolbox" },
			arcReplies: {},
			want: { stdout: "/home/user/src/toolbox\n", code: 0 },
		},
		{
			name: "key spelling variants hit the same entry (git canonicalization)",
			argv: ["config", "--global", "--get-all", "Maintenance.REPO"],
			config: { "maintenance.repo": "/home/user/src/toolbox" },
			arcReplies: {},
			want: { stdout: "/home/user/src/toolbox\n", code: 0 },
		},
	],
})
