// Exactly one remote exists in the arc world: "arcadia".
// The URL carries a path component (arc://arcadia/arcadia, not arc://arcadia)
// on purpose: consumers canonicalize remote URLs as host+path and DROP a
// path-less URL (empty path → no identity). With the path, every arcadia
// checkout — this machine, a VPS, a worktree — shares one stable remote
// identity, so orca groups them as ONE project instead of a project each.
import { ARC_REMOTE_URL, definePath, ok } from "../core"

export default definePath({
	name: "remote-list",
	summary: "the single remote: arcadia",
	spec: "remote (-v|--verbose)?",

	async run(args) {
		if (args.flags.has("-v") || args.flags.has("--verbose"))
			return ok(`arcadia\t${ARC_REMOTE_URL} (fetch)\narcadia\t${ARC_REMOTE_URL} (push)\n`)
		return ok("arcadia\n")
	},

	fixtures: [
		{
			name: "list remotes",
			argv: ["remote"],
			arcReplies: {},
			want: { stdout: "arcadia\n", code: 0 },
		},
		{
			name: "verbose",
			argv: ["remote", "-v"],
			arcReplies: {},
			want: { stdout: "arcadia\tarc://arcadia/arcadia (fetch)\narcadia\tarc://arcadia/arcadia (push)\n", code: 0 },
		},
	],
})
