// T3 releases its private base ref after generating a review guide.
import { definePath, isPrivateRef, ok } from "../core"

export default definePath({
	name: "update-ref-private-delete",
	summary: "remove a shim-local private ref",
	spec: "update-ref -d <ref>",
	refine: args => isPrivateRef(args.pos.ref!),
	async run(args, ctx) {
		ctx.refs.delete(args.pos.ref!)
		return ok()
	},
	fixtures: [{
		name: "delete an absent review pin is idempotent",
		argv: ["update-ref", "-d", "refs/t3/review-guide/one/base"],
		arcReplies: {},
		want: { stdout: "", code: 0 },
	}],
})
