// orca: for-each-ref --format=%(HEAD)%09%(refname:short) refs/heads/
// Local branches come from arc branch --json (GOLDEN entry shape:
// {"local":true,"name":"...","current":true?}). Supported placeholders:
// %(HEAD) %(refname) %(refname:short) and %XX byte escapes (%09 tab, %0a LF).
// Unsupported placeholders (e.g. %(objectname)) → refine rejects → learnable.
import { arcJson, definePath, isExecResult, ok } from "../core"

const SUPPORTED = /^(HEAD|refname|refname:short)$/

interface BranchEntry {
	local?: boolean
	name: string
	current?: boolean
}

const renderable = (fmt: string): boolean =>
	[...fmt.matchAll(/%\(([^)]*)\)/g)].every((m) => SUPPORTED.test(m[1]!))

export default definePath({
	name: "for-each-ref-heads",
	summary: "iterate local branches with a %(...) format",
	spec: "for-each-ref --format=<fmt> <pattern>?",
	refine: (args) =>
		(args.pos.pattern === undefined || args.pos.pattern!.startsWith("refs/heads")) && renderable(args.pos.fmt!),

	async run(args, ctx) {
		const entries = await arcJson<BranchEntry[]>(ctx, ["branch", "--json"])
		if (isExecResult(entries)) return entries
		const locals = entries.filter((e) => e.local).sort((a, b) => (a.name < b.name ? -1 : 1))
		const lines = locals.map((e) =>
			args.pos
				.fmt!.replace(/%\(([^)]*)\)/g, (_, ph: string) => {
					if (ph === "HEAD") return e.current ? "*" : " "
					if (ph === "refname") return `refs/heads/${e.name}`
					return e.name // refname:short
				})
				.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
		)
		return ok(lines.map((l) => l + "\n").join(""))
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
	],
})
