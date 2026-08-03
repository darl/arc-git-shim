// orca: for-each-ref --format=%(HEAD)%09%(refname:short) refs/heads/
// Local branches come from arc branch --json (GOLDEN entry shape:
// {"local":true,"name":"...","current":true?}). Supported placeholders:
// %(HEAD) %(refname) %(refname:short) and %XX byte escapes (%09 tab, %0a LF).
// Unsupported placeholders (e.g. %(objectname)) → refine rejects → learnable.
import { definePath, isExecResult, ok } from "../core"
import { BASIC_PLACEHOLDERS, byRefname, entryRefname, listBranches, refMatches, renderRef, renderable } from "../refs"

export default definePath({
	name: "for-each-ref-heads",
	summary: "iterate local branches with a %(...) format",
	spec: "for-each-ref --format=<fmt> <pattern>?",
	refine: (args) =>
		(args.pos.pattern === undefined || args.pos.pattern!.startsWith("refs/heads")) &&
		renderable(args.pos.fmt!, BASIC_PLACEHOLDERS),

	async run(args, ctx) {
		const entries = await listBranches(ctx)
		if (isExecResult(entries)) return entries
		let refs = entries
			.filter((e) => e.local)
			.map((e) => ({ refname: entryRefname(e), current: !!e.current }))
			.sort(byRefname)
		if (args.pos.pattern !== undefined) refs = refs.filter((r) => refMatches(args.pos.pattern!, r.refname))
		return ok(refs.map((r) => renderRef(args.pos.fmt!, r.refname, r.current) + "\n").join(""))
	},

	fixtures: [
		{
			name: "orca format: HEAD marker + tab + short name",
			argv: ["for-each-ref", "--format=%(HEAD)%09%(refname:short)", "refs/heads/"],
			arcReplies: {
				"branch --json": {
					stdout:
						'[{"local":true,"name":"pr-12345678","current":true},{"local":true,"name":"trunk"},{"name":"arcadia/users/darl/x"}]',
				},
			},
			want: { stdout: "*\tpr-12345678\n \ttrunk\n", code: 0 },
		},
		{
			name: "full refname",
			argv: ["for-each-ref", "--format=%(refname)", "refs/heads/"],
			arcReplies: {
				"branch --json": { stdout: '[{"local":true,"name":"trunk"}]' },
			},
			want: { stdout: "refs/heads/trunk\n", code: 0 },
		},
		{
			name: "glob pattern filters, not just prefix-gates",
			argv: ["for-each-ref", "--format=%(refname:short)", "refs/heads/feature-*"],
			arcReplies: {
				"branch --json": {
					stdout: '[{"local":true,"name":"feature-x"},{"local":true,"name":"trunk"}]',
				},
			},
			want: { stdout: "feature-x\n", code: 0 },
		},
		{
			name: "character classes match (fnmatch [ab] semantics)",
			argv: ["for-each-ref", "--format=%(refname:short)", "refs/heads/feature-[xy]"],
			arcReplies: {
				"branch --json": {
					stdout: '[{"local":true,"name":"feature-x"},{"local":true,"name":"feature-z"}]',
				},
			},
			want: { stdout: "feature-x\n", code: 0 },
		},
	],
})
