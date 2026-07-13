// Pure local validation, no arc call. Validates a full refname the way
// `git check-ref-format <refname>` does: exit 0 (silent) if valid, exit 1
// (silent) if not. With --normalize/--print, the normalized ref is echoed.
// With --allow-onelevel, single-component refs like "foo" are accepted.
// With --refspec-pattern, a single "*" wildcard is permitted.
//
// Rules (from git check-ref-format --help):
//  1. No component may begin with "." or end with ".lock".
//  2. At least one "/" (two levels) unless --allow-onelevel.
//  3. No ".." (consecutive dots) anywhere.
//  4. No control chars, space, ~, ^, or ":".
//  5. No ?, *, or [ (except one * with --refspec-pattern).
//  6. No backslash.
//  7. No "@{" sequence.
//  8. Cannot begin or end with "/".
//  9. Cannot contain "//" (consecutive slashes).
// 10. Cannot end with ".".
// 11. The literal "@" alone is always invalid.
// --normalize strips leading "/" and collapses runs of "/" before validating.
import { definePath, fail, ok } from "../core"

const normalize = (ref: string): string => ref.replace(/\/+/g, "/").replace(/^\//, "")

const validRefName = (ref: string, allowOneLevel: boolean, refspecPattern: boolean): boolean => {
	if (!ref || ref === "@") return false
	// Control chars, space, ~, ^, :, ?, [, \ — * only allowed with refspec-pattern
	const badChars = refspecPattern ? /[\s~^:?[\\\x00-\x1f\x7f]/ : /[\s~^:?*[\\\x00-\x1f\x7f]/
	if (badChars.test(ref)) return false
	if (ref.includes("..") || ref.includes("@{")) return false
	if (ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".") || ref.includes("//")) return false
	// At most one "*" with --refspec-pattern
	if (refspecPattern && (ref.match(/\*/g) || []).length > 1) return false
	const components = ref.split("/")
	if (components.some((c) => c.startsWith(".") || c.endsWith(".lock"))) return false
	// Rule 2: at least two levels unless --allow-onelevel
	if (!allowOneLevel && components.length < 2) return false
	return true
}

export default definePath({
	name: "check-ref-format-refname",
	summary: "local refname validity check (exit code is the answer)",
	spec: "check-ref-format --normalize? --print? --allow-onelevel? --refspec-pattern? <refname>",

	async run(args) {
		const raw = args.pos.refname!
		const wantNormalize = args.flags.has("--normalize") || args.flags.has("--print")
		const allowOneLevel = args.flags.has("--allow-onelevel")
		const refspecPattern = args.flags.has("--refspec-pattern")
		const ref = wantNormalize ? normalize(raw) : raw
		if (!validRefName(ref, allowOneLevel, refspecPattern)) return fail(1, "")
		return wantNormalize ? ok(`${ref}\n`) : ok()
	},

	fixtures: [
		{
			name: "valid three-level ref",
			argv: ["check-ref-format", "refs/heads/trunk"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "double dot invalid",
			argv: ["check-ref-format", "refs/heads/foo..bar"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "one-level ref rejected without allow-onelevel",
			argv: ["check-ref-format", "foo"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "one-level ref accepted with allow-onelevel",
			argv: ["check-ref-format", "--allow-onelevel", "foo"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "at-sign alone always invalid",
			argv: ["check-ref-format", "--allow-onelevel", "@"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "component starting with dot invalid",
			argv: ["check-ref-format", "refs/heads/.hidden"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "component ending with lock invalid",
			argv: ["check-ref-format", "refs/heads/foo.lock"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "normalize echoes valid ref",
			argv: ["check-ref-format", "--normalize", "refs/heads/trunk"],
			arcReplies: {},
			want: { stdout: "refs/heads/trunk\n", code: 0 },
		},
		{
			name: "normalize strips leading slash and collapses doubles",
			argv: ["check-ref-format", "--normalize", "//refs//heads//foo"],
			arcReplies: {},
			want: { stdout: "refs/heads/foo\n", code: 0 },
		},
		{
			name: "normalize trailing slash still invalid",
			argv: ["check-ref-format", "--normalize", "refs/heads/foo/"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "print alias works like normalize",
			argv: ["check-ref-format", "--print", "refs/heads/trunk"],
			arcReplies: {},
			want: { stdout: "refs/heads/trunk\n", code: 0 },
		},
		{
			name: "refspec-pattern allows single star",
			argv: ["check-ref-format", "--refspec-pattern", "refs/heads/*"],
			arcReplies: {},
			want: { stdout: "", code: 0 },
		},
		{
			name: "refspec-pattern rejects two stars",
			argv: ["check-ref-format", "--refspec-pattern", "refs/heads/**"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "star rejected without refspec-pattern",
			argv: ["check-ref-format", "refs/heads/*"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
	],
})
