// Arc has no patch-application or patch-checking command.
import { definePath, fail } from "../core"

export default definePath({
	name: "apply-check-strip-unsafe",
	summary: "reject patch applicability checks without an arc equivalent",
	spec: "apply --check -p=<strip> --unsafe-paths <patch>",
	refine: (args) => /^\d+$/.test(args.pos.strip!),

	async run() {
		return fail(128, "fatal: 'apply --check' is not supported in an arc repository\n")
	},

	fixtures: [
		{
			name: "patch check with strip count and unsafe paths",
			argv: ["apply", "--check", "-p3", "--unsafe-paths", "/tmp/example.patch"],
			arcReplies: {},
			want: { stdout: "", stderr: "fatal: 'apply --check' is not supported in an arc repository\n", code: 128 },
		},
	],
})
