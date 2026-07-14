// git check-ignore checks whether given pathspecs match .gitignore rules and
// prints the ones that do (exit 0 if any match, 1 if none). Arc has no
// equivalent: there is no `arc check-ignore`, and `arc status --ignored` uses
// arc's own .arcignore semantics — not git's .gitignore pattern language
// (anchoring, ** globs, negation, trailing-slash dir-only, etc.). Faithfully
// emulating gitignore matching against the wrong ignore file would silently
// produce wrong answers, so this is a permanent no-equivalent fatal.
import { definePath, fail } from "../core"

export default definePath({
	name: "check-ignore",
	summary: "no arc equivalent; gitignore pattern-checking is not supported",
	spec: "check-ignore -- <paths...>",

	async run() {
		return fail(128, "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n")
	},

	fixtures: [
		{
			name: "check-ignore with separator fatals",
			argv: ["check-ignore", "--", ".arc", "somedir", "ya.make"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n",
				code: 128,
			},
		},
		{
			name: "check-ignore single path fatals",
			argv: ["check-ignore", "--", "node_modules"],
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: 'check-ignore' is not supported in an arc repository (arc uses .arcignore, not .gitignore)\n",
				code: 128,
			},
		},
	],
})
