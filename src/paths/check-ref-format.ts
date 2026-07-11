// Pure local validation, no arc call. orca reads only the exit code.
// Rules (the subset that matters): no spaces, no leading/trailing slash or
// dot, no "..", no control chars, no ~^:?*[\, no "@{", no trailing ".lock",
// not "@", no consecutive slashes, no component ending in ".lock" or starting
// with ".".
import { definePath, fail, ok } from "../core"

const validBranchName = (name: string): boolean => {
	if (!name || name === "@") return false
	if (/[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)) return false
	if (name.includes("..") || name.includes("@{") || name.includes("//")) return false
	if (name.startsWith("/") || name.endsWith("/") || name.endsWith(".")) return false
	return !name.split("/").some((c) => c.startsWith(".") || c.endsWith(".lock") || c === "")
}

export default definePath({
	name: "check-ref-format-branch",
	summary: "local branch-name validity check (exit code is the answer)",
	spec: "check-ref-format --branch <name>",

	async run(args) {
		const name = args.pos.name!
		if (!validBranchName(name)) return fail(1, `fatal: '${name}' is not a valid branch name\n`)
		return ok(`${name}\n`)
	},

	fixtures: [
		{
			name: "valid name echoes",
			argv: ["check-ref-format", "--branch", "users/darl/feature-x"],
			arcReplies: {},
			want: { stdout: "users/darl/feature-x\n", code: 0 },
		},
		{
			name: "double dot invalid",
			argv: ["check-ref-format", "--branch", "a..b"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
		{
			name: "leading dot component invalid",
			argv: ["check-ref-format", "--branch", ".hidden"],
			arcReplies: {},
			want: { stdout: "", code: 1 },
		},
	],
})
