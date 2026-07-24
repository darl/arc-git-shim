// git rev-list --left-right --count <a>...<b>  → "<left>\t<right>\n" (orca
// ahead/behind UI); git rev-list --count <a>..<b> → "<n>\n".
// Counts come from one-line-per-commit arc log output over the ranges.
// Endpoints go through arcRev so origin/trunk and refs/... forms resolve
// (t3code's base-branch probe counts origin/trunk..HEAD).
import { arcRev, countRange, definePath, fail, isExecResult, ok } from "../core"

const normalizeRange = (range: string): string => {
	const sep = range.includes("...") ? "..." : ".."
	return range
		.split(sep)
		.map((end) => (end === "" ? end : arcRev(end)))
		.join(sep)
}

export default definePath({
	name: "rev-list-count",
	summary: "commit counts over ranges via arc log",
	spec: "rev-list --count --left-right? <range>",
	refine: (args) => args.pos.range!.includes(".."),

	async run(args, ctx) {
		const range = normalizeRange(args.pos.range!)
		if (args.flags.has("--left-right")) {
			const [a, b] = range.split("...")
			if (!a || !b) return fail(128, `fatal: bad revision '${range}'\n`)
			const [left, right] = await Promise.all([countRange(ctx, `${b}..${a}`), countRange(ctx, `${a}..${b}`)])
			if (isExecResult(left)) return left
			if (isExecResult(right)) return right
			return ok(`${left}\t${right}\n`)
		}
		const n = await countRange(ctx, range)
		if (isExecResult(n)) return n
		return ok(`${n}\n`)
	},

	fixtures: [
		{
			name: "left-right ahead 2 behind 1",
			argv: ["rev-list", "--left-right", "--count", "HEAD...arcadia/trunk"],
			arcReplies: {
				"log --format={commit} arcadia/trunk..HEAD": { stdout: "aaa\nbbb\n" },
				"log --format={commit} HEAD..arcadia/trunk": { stdout: "ccc\n" },
			},
			want: { stdout: "2\t1\n", code: 0 },
		},
		{
			name: "plain count, empty range",
			argv: ["rev-list", "--count", "trunk..HEAD"],
			arcReplies: { "log --format={commit} trunk..HEAD": { stdout: "" } },
			want: { stdout: "0\n", code: 0 },
		},
		{
			name: "origin alias normalized in range",
			argv: ["rev-list", "--count", "origin/trunk..HEAD"],
			arcReplies: { "log --format={commit} arcadia/trunk..HEAD": { stdout: "aaa\nbbb\n" } },
			want: { stdout: "2\n", code: 0 },
		},
	],
})
