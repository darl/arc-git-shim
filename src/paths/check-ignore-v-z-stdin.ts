// git check-ignore -v -z --stdin reads NUL-delimited pathspecs from stdin and
// prints, for each path matching a .gitignore rule, the matching pattern
// together with the path (NUL-delimited, exit 1 if none match). The -v flag
// only changes the output record shape; structurally this is the -z --stdin
// variant plus one more literal flag, so it needs its own spec to match —
// the existing -z --stdin path cannot swallow the -v without declaring it.
//
// Arc has no `arc check-ignore`, and `arc status --ignored` uses arc's own
// .arcignore semantics — not git's .gitignore pattern language (anchoring,
// ** globs, negation, trailing-slash dir-only, etc.). The shim's Ctx also
// exposes no stdin, so it could not feed paths to arc even if arc had an
// equivalent. Faithfully emulating gitignore pattern reporting against the
// wrong ignore file would silently produce wrong answers, so this is a
// permanent no-equivalent fatal — the same verdict as the other check-ignore
// variants.
import { definePath, fail } from "../core"

export default definePath({
	name: "check-ignore-v-z-stdin",
	summary: "no arc equivalent; verbose stdin/NUL gitignore checking is not supported",
	spec: "check-ignore -v -z --stdin",

	async run() {
		return fail(128, "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n")
	},

	fixtures: [
		{
			name: "check-ignore -v -z --stdin fatals",
			argv: ["check-ignore", "-v", "-z", "--stdin"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n",
				code: 128,
			},
		},
	],
})
