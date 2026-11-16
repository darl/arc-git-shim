// Arc cannot supply Git's raw blob IDs or Git-compatible rename detection.
// In particular, --ignore-all-space does not suppress raw records for a
// whitespace-only change, even though it may suppress its numstat record.
import { definePath, fail } from "../core"

export default definePath({
	name: "diff-raw-numstat-submodule-short-minimal-ignore-space",
	summary: "reject combined raw and numstat output requiring Git blob metadata",
	spec: "diff --find-renames --no-color --no-ext-diff --no-textconv --submodule=short --src-prefix=a/ --dst-prefix=b/ --minimal --ignore-all-space --raw --numstat -z <rev> --",
	refine: (args) => args.pos.rev === "HEAD",

	async run() {
		return fail(128, "fatal: diff --raw --numstat is not supported in an arc repository\n")
	},

	fixtures: [
		{
			name: "combined raw and numstat cannot be represented faithfully",
			argv: ["diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--submodule=short", "--src-prefix=a/", "--dst-prefix=b/", "--minimal", "--ignore-all-space", "--raw", "--numstat", "-z", "HEAD", "--"],
			arcReplies: {},
			want: { code: 128, stderr: "fatal: diff --raw --numstat is not supported in an arc repository\n" },
		},
	],
})
