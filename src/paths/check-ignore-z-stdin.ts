// git check-ignore -z --stdin reads NUL-delimited pathspecs from stdin and
// echoes back the ones matching .gitignore rules (NUL-delimited, exit 1 if
// none match). This variant differs structurally from `check-ignore -- <paths…>`
// (no separator, no positional paths, two flags), so it needs its own path.
//
// Arc has no `arc check-ignore`, and `arc status --ignored` uses arc's own
// .arcignore semantics — not git's .gitignore pattern language (anchoring,
// ** globs, negation, trailing-slash dir-only, etc.). The shim's Ctx also
// exposes no stdin, so it could not feed paths to arc even if arc had an
// equivalent. Faithfully emulating gitignore matching against the wrong
// ignore file would silently produce wrong answers, so this is a permanent
// no-equivalent fatal — the same verdict as the positional variant.
import { definePath, fail } from "../core"

export default definePath({
	name: "check-ignore-z-stdin",
	summary: "no arc equivalent; stdin/NUL gitignore checking is not supported",
	spec: "check-ignore -z --stdin",

	async run() {
		return fail(128, "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n")
	},

	fixtures: [
		{
			name: "check-ignore -z --stdin fatals",
			argv: ["check-ignore", "-z", "--stdin"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n",
				code: 128,
			},
		},
	],
})
