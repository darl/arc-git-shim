// Arc maintains its own index; Git's quiet stat-cache refresh and forced
// index write have no corresponding cache to update in the shim.
import { definePath, ok } from "../core"

export default definePath({
	name: "update-index-quiet-refresh",
	summary: "quietly refresh Git's index cache (no-op for arc)",
	spec: "update-index -q --refresh --force-write-index",

	async run() {
		return ok()
	},

	fixtures: [
		{
			name: "quiet forced index refresh",
			argv: ["update-index", "-q", "--refresh", "--force-write-index"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 0 },
		},
	],
})
