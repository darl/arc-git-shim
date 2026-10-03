// orca: diff [--cached|--staged] --name-only --diff-filter=<classes> [-z]
// [<rev>] [-- <paths>...]. arc diff has no --diff-filter (verified against
// `arc diff --help`), so the shim asks for --name-status instead and filters
// the status letters itself, emitting name-only records. git's filter rules,
// verified against native git: an uppercase class letter means "only this
// class", a lowercase letter means "exclude this class", and the result is
// the union (Dm = D plus everything except M — a file matching either rule
// passes); an unknown class is rejected with git's exact
// "error: unknown change class 'X' in --diff-filter=..." and exit 129; '*'
// is all-or-nothing (all files if any file matches the letters, else none —
// with '*' alone native git prints nothing). No matches → empty stdout,
// exit 0. -z NUL-terminates each record like git's --name-only -z.
// The rev is passed through without the merge-base/worktree lens — --cached
// already pins the base, same as the other diff-cached-* paths.
import { definePath, expandDiffRev, isExecResult, ok, fail } from "../core"

// git's change classes (lowercase forms exclude); '*' handled separately
const CLASSES = "ACDMRTUXB"

export default definePath({
	name: "diff-cached-name-only-diff-filter",
	summary: "name-only staged file list filtered by --diff-filter change class",
	spec: "diff (--cached|--staged) --name-only --diff-filter=<letters> -z? <rev>? --? <paths...>?",

	async run(args, ctx) {
		const filter = args.pos.letters!
		for (const c of filter) {
			if (c !== "*" && !CLASSES.includes(c.toUpperCase()))
				return fail(129, `error: unknown change class '${c}' in --diff-filter=${filter}\n`)
		}
		// uppercase = include-only set; lowercase = exclude set (uppercased)
		const includes = new Set([...filter].filter((c) => CLASSES.includes(c)))
		const excludes = new Set([...filter].filter((c) => c >= "a" && c <= "z").map((c) => c.toUpperCase()))
		const star = filter.includes("*")
		// union rule: an include hit OR (any exclude declared and not excluded)
		const letterPass = (l: string) => includes.has(l) || (excludes.size > 0 && !excludes.has(l))

		const arcArgs = ["diff", "--cached", "--name-status"]
		if (args.pos.rev !== undefined) {
			const t = await expandDiffRev(ctx, args.pos.rev, false)
			if (isExecResult(t)) return t
			arcArgs.push(...t)
		}
		arcArgs.push(...(args.list.paths ?? []))
		const r = await ctx.arc(arcArgs, { cwd: ctx.arcRoot })
		if (r.code !== 0) return r

		// "X\tpath" records; rename/copy scores ("R100\told\tnew") → last field
		const recs = r.stdout
			.split("\n")
			.filter(Boolean)
			.map((l) => {
				const f = l.split("\t")
				return { letter: f[0]![0]!, path: f[f.length - 1]! }
			})

		let kept: string[]
		if (includes.size === 0 && excludes.size === 0)
			// no letter rules: '*' alone selects none, bare/empty filter = no-op
			kept = star ? [] : recs.map((x) => x.path)
		else if (star) kept = recs.some((x) => letterPass(x.letter)) ? recs.map((x) => x.path) : []
		else kept = recs.filter((x) => letterPass(x.letter)).map((x) => x.path)

		const sep = args.flags.has("-z") ? "\0" : "\n"
		return ok(kept.map((p) => p + sep).join(""))
	},

	fixtures: [
		{
			name: "arriving shape: staged deletions only, NUL-delimited",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=D", "-z", "HEAD", "--"],
			arcReplies: {
				"diff --cached --name-status HEAD": {
					stdout:
						"M\tdir/sub/keep.txt\n" +
						"D\tdir/sub/gone.txt\n" +
						"A\tdir/sub/added.txt\n",
				},
			},
			want: { stdout: "dir/sub/gone.txt\x00", code: 0 },
		},
		{
			name: "modified only, newline-delimited, no rev",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=M"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tcode/mod.go\nD\tcode/old.go\n",
				},
			},
			want: { stdout: "code/mod.go\n", code: 0 },
		},
		{
			name: "pathspec after separator",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=D", "--", "dir/sub"],
			arcReplies: {
				"diff --cached --name-status dir/sub": {
					stdout: "D\tdir/sub/gone.txt\nM\tdir/sub/keep.txt\n",
				},
			},
			want: { stdout: "dir/sub/gone.txt\n", code: 0 },
		},
		{
			name: "rev plus pathspec",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=A", "HEAD", "--", "dir"],
			arcReplies: {
				"diff --cached --name-status HEAD dir": {
					stdout: "A\tdir/new.txt\nD\tdir/old.txt\n",
				},
			},
			want: { stdout: "dir/new.txt\n", code: 0 },
		},
		{
			name: "--staged alias with explicit rev",
			argv: ["diff", "--staged", "--name-only", "--diff-filter=A"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "new.txt\n", code: 0 },
		},
		{
			name: "mixed case: include D, exclude m → D and A pass",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=Dm"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "new.txt\ngone.txt\n", code: 0 },
		},
		{
			name: "lowercase-only filter excludes the class",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=d"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "keep.txt\nnew.txt\n", code: 0 },
		},
		{
			name: "no matches: empty stdout, exit 0",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=R", "HEAD", "--"],
			arcReplies: {
				"diff --cached --name-status HEAD": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "NUL-delimited, multiple matches",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=AD", "-z"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "new.txt\x00gone.txt\x00", code: 0 },
		},
		{
			name: "star alone selects nothing (all-or-none, no letters)",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=*"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "star with a matching letter selects everything",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=D*"],
			arcReplies: {
				"diff --cached --name-status": {
					stdout: "M\tkeep.txt\nA\tnew.txt\nD\tgone.txt\n",
				},
			},
			want: { stdout: "keep.txt\nnew.txt\ngone.txt\n", code: 0 },
		},
		{
			name: "empty staged diff with -z",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=D", "-z"],
			arcReplies: { "diff --cached --name-status": { stdout: "" } },
			want: { stdout: "", code: 0 },
		},
		{
			name: "unknown change class: git-shaped 129 error",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=Z", "HEAD", "--"],
			arcReplies: {},
			want: { stderr: "error: unknown change class 'Z' in --diff-filter=Z\n", code: 129 },
		},
		{
			name: "arc failure passes through",
			argv: ["diff", "--cached", "--name-only", "--diff-filter=D", "nosuchrev"],
			arcReplies: { "diff --cached --name-status nosuchrev": { stderr: "Error: unknown revision\n", code: 1 } },
			want: { stderr: "Error: unknown revision\n", code: 1 },
		},
	],
})
