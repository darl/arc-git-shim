// git status --porcelain=v1|short -z with --ignored=[<mode>] and trailing
// pathspecs ("… -z -- <paths...>"): the per-directory poll IDEs issue against
// monorepo subtrees, and scripts enumerating ignored files under a subdir.
// Composed from arc primitives (arc -s porcelain output is GOLDEN — see
// status-porcelain-v1-z) in two arc calls at the arc root:
//
//   1. `arc status -s [-b] [-u <zoom>] [paths...]` — tracked + untracked
//      lines (XY / ??), caller's untracked zoom forwarded.
//   2. `arc status -s --ignored [-u <ignored-zoom>] [paths...]` — git-shaped
//      `!!` lines for the tree's ignored entries. Arc derives these from
//      .arcignore (not git's pattern language, see check-ignore): the `!!`
//      set reflects arc's reality of what is ignored on disk, which is also
//      what callers observe as ignored in a real arc working copy.
//
// Ignored zoom verified against git 2.50.1 side by side with real arc:
//   matching    → `!!` per-file matches + `!! rule-dir/` (trailing slash, NOT
//                 expanded, IDENTICAL under -uall and -unormal) — byte-equal
//                 to arc's `-u normal` ignored listing, so the ignored call
//                 always zooms normal under matching.
//   traditional → with -uall, ignored DIRS expand per-file — equal to arc's
//                 `-u all` (probe: arc expands the same way). Without -uall,
//                 collapsed; git collapses to the top ignored directory,
//                 arc to the rule-matched one (close approximation, noted).
//   -uno        → never forwarded into the ignored call: git shows ZERO
//                 ignored entries under -uno+traditional (verified), and arc
//                 has its own trap (`-u no` suppresses ignored output even
//                 with --ignored). -uno+matching is git-fatal and this path
//                 reproduces the fatal byte-for-byte before calling arc.
//
// Pathspecs: git resolves them against the invocation cwd, arc lists
// root-relative — specs are translated to root-relative (including absolute
// forms inside the root, "."/".." normalization, trailing-slash stripping).
// They are passed to arc as plain path args (arc matches component-wise;
// a nonexistent path yields empty output with exit 0 — same as git) and the
// returned lines are re-filtered shim-side so git's component-prefix
// semantics hold regardless of arc's matching details. Pathspec magic
// (leading ":", globs) is refused by refine() and falls through to learning
// rather than being silently approximated (git's glob pathspecs change
// ignored-listing semantics in ways a literal filter cannot express).
// An empty-string pathspec and an absolute path outside the root are
// rejected with git's exact fatal bytes.
//
// --renames/--no-renames are no-ops (arc status never detects renames).
// -b branch headers start with "#" and pass the pathspec filter untouched.
import { definePath, fail, ok } from "../core"

/** git's option-validation fatals (captured byte-exact from git 2.50.1). */
const UNSUPPORTED_COMBO =
	"fatal: Unsupported combination of ignored and untracked-files arguments\n"
const EMPTY_PATHSPEC =
	"fatal: empty string is not a valid pathspec. please use . instead if you meant to match all paths\n"

export default definePath({
	name: "status-porcelain-v1-z-ignored-pathspec",
	summary: "porcelain-v1 -z status with --ignored and trailing pathspecs",
	// --ignored is REQUIRED (with any accepted form) — this is the only new
	// token class no sibling path declares, so every argv this path matches
	// is provably not claimable by the ignored-less status paths.
	spec:
		"status --renames? --no-renames? (-s|--short|--porcelain|--porcelain=v1) -z (-b|--branch)? " +
		"--untracked-files=(all|no|normal)? (-uall|-uno)? " +
		"(--ignored|--ignored=no|--ignored=traditional|--ignored=matching) --? <paths...>?",

	// pathspec magic (":" prefix) and glob metachars change git's matching and
	// even its ignored-listing shape; undeclared shapes must keep falling
	// through to learning instead of being approximated with literal semantics
	refine: (args) => (args.list.paths ?? []).every((p) => !p.startsWith(":") && !/[*?[\]\\]/.test(p)),

	async run(args, ctx) {
		// resolved ignored mode; bare --ignored is git-traditional
		const ig = [...args.flags].find((f) => f.startsWith("--ignored")) ?? "--ignored=no"
		const ignoreMode = ig === "--ignored=matching" ? "matching" : ig === "--ignored=no" ? "no" : "traditional"

		// caller's untracked zoom (set iteration order = capture order = argv
		// order). Default normal when the caller did not name a mode.
		const uFlag = [...args.flags].find((f) => f.startsWith("--untracked-files=") || f === "-uall" || f === "-uno")
		const uMode = uFlag ? uFlag.replace(/^(--untracked-files=|-u)/, "") : "normal"

		// git (2.50.1) rejects matching with an untracked-files suppression
		if (ignoreMode === "matching" && uMode === "no") return fail(128, UNSUPPORTED_COMBO)

		// pathspec translation: git specs are cwd-relative; arc lists
		// root-relative. Empty normalized spec = match-all.
		const relCwd =
			ctx.cwd === ctx.arcRoot ? "" : ctx.cwd.startsWith(ctx.arcRoot + "/") ? ctx.cwd.slice(ctx.arcRoot.length + 1) : ""
		const toRootRel = (raw: string): string => {
			let p = relCwd && !raw.startsWith("/") ? relCwd + "/" + raw : raw
			if (p.startsWith("/") && (p === ctx.arcRoot || p.startsWith(ctx.arcRoot + "/"))) p = p.slice(ctx.arcRoot.length + 1)
			const out: string[] = []
			for (const c of p.split("/")) {
				if (c === "" || c === ".") continue
				if (c === "..") out.pop()
				else out.push(c)
			}
			return out.join("/")
		}
		const specs: string[] = []
		const rawPaths = args.list.paths ?? []
		for (const raw of rawPaths) {
			if (raw === "") return fail(128, EMPTY_PATHSPEC)
			// absolute pathspec that escapes the arc root: git's exact fatal (best
			// effort on the repo path — git prints the realpath of the repo there)
			if (raw.startsWith("/") && raw !== ctx.arcRoot && !raw.startsWith(ctx.arcRoot + "/"))
				return fail(128, `fatal: ${raw}: '${raw}' is outside repository at '${ctx.arcRoot}'\n`)
			specs.push(toRootRel(raw))
		}
		// union semantics: "." anywhere matches everything (arc needs no args then)
		const matchAll = specs.length === 0 || specs.some((s) => s === "")
		const arcPaths = matchAll ? [] : specs
		const keep = (path: string): boolean => matchAll || specs.some((s) => path === s || path.startsWith(s + "/"))

		// call 1: tracked + untracked at the caller's zoom
		const trackedArgs = ["status", "-s"]
		if (args.flags.has("-b") || args.flags.has("--branch")) trackedArgs.push("-b")
		if (uFlag) trackedArgs.push("-u", uMode)
		trackedArgs.push(...arcPaths)

		// call 2: `!!` lines only. matching always zooms normal (== git's
		// rule-matched collapse under both -u zooms); traditional expands under
		// -uall and collapses otherwise; -uno callers get none (git-verified).
		const ignoredArgs =
			ignoreMode !== "no" && uMode !== "no"
				? [
						"status",
						"-s",
						"--ignored",
						"-u",
						ignoreMode === "matching" || uMode !== "all" ? "normal" : "all",
						...arcPaths,
					]
				: null

		const tracked = await ctx.arc(trackedArgs, { cwd: ctx.arcRoot })
		if (tracked.code !== 0) return tracked
		const lines = tracked.stdout.split("\n")
		if (ignoredArgs) {
			const ignored = await ctx.arc(ignoredArgs, { cwd: ctx.arcRoot })
			if (ignored.code !== 0) return ignored
			// arc may list tracked/untracked groups alongside `!!` under --ignored;
			// only `!!` lines are new here (call 1 already contributed the rest)
			lines.push(...ignored.stdout.split("\n").filter((l) => l.startsWith("!!")))
		}
		// porcelain v1 shape: XY + SP + path ("#"/"##" headers pass untouched);
		// -z: every entry NUL-terminated, no C-quoting (arc never C-quotes)
		const out = lines
			.filter((l) => l !== "")
			.filter((l) => l.startsWith("#") || keep(l.slice(3)))
		return ok(out.length ? out.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "exact incoming command: --no-renames --ignored=matching --uf=all --porcelain=v1 -z -- dir",
			argv: ["status", "--no-renames", "--ignored=matching", "--untracked-files=all", "--porcelain=v1", "-z", "--", "proj/module"],
			arcReplies: {
				"status -s -u all proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
				"status -s --ignored -u normal proj/module": {
					stdout: "!! proj/module/build/\n!! proj/module/scratch/dead.tmp\n",
				},
			},
			want: {
				stdout:
					"A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/x.txt\0" +
					"!! proj/module/build/\0!! proj/module/scratch/dead.tmp\0",
				code: 0,
			},
		},
		{
			name: "clean tree, ignored-only under pathspec (trailing-slash dir + file)",
			argv: ["status", "--ignored=matching", "--untracked-files=all", "--porcelain=v1", "-z", "--", "proj/cache"],
			arcReplies: {
				"status -s -u all proj/cache": { stdout: "" },
				"status -s --ignored -u normal proj/cache": { stdout: "!! proj/cache/dl/\n!! proj/cache/stage.bin\n" },
			},
			want: { stdout: "!! proj/cache/dl/\0!! proj/cache/stage.bin\0", code: 0 },
		},
		{
			name: "git-fatal: -uno with --ignored=matching (no arc calls)",
			argv: ["status", "--porcelain", "-z", "-uno", "--ignored=matching"],
			arcReplies: {},
			want: { stderr: "fatal: Unsupported combination of ignored and untracked-files arguments\n", code: 128 },
		},
		{
			name: "git-fatal: empty-string pathspec",
			argv: ["status", "--porcelain", "-z", "--ignored=matching", "--", ""],
			arcReplies: {},
			want: {
				stderr:
					"fatal: empty string is not a valid pathspec. please use . instead if you meant to match all paths\n",
				code: 128,
			},
		},
		{
			name: "git-fatal: absolute pathspec outside the arc root",
			argv: ["status", "--porcelain", "-z", "--ignored=matching", "--", "/aud/elsewhere"],
			arcReplies: {},
			want: { stdout: "", stderr: "fatal: /aud/elsewhere: '/aud/elsewhere' is outside repository at '/arcadia'\n", code: 128 },
		},
		{
			name: "traditional + -uall: ignored dirs expand per-file (arc -u all)",
			argv: ["status", "--ignored=traditional", "--untracked-files=all", "--porcelain=v1", "-z", "--", "proj/module"],
			arcReplies: {
				"status -s -u all proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
				"status -s --ignored -u all proj/module": {
					stdout: "!! proj/module/build/shard.o\n!! proj/module/build/thing.a\n!! proj/module/scratch/dead.tmp\n",
				},
			},
			want: {
				stdout:
					"A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/x.txt\0" +
					"!! proj/module/build/shard.o\0!! proj/module/build/thing.a\0!! proj/module/scratch/dead.tmp\0",
				code: 0,
			},
		},
		{
			name: "bare --ignored (traditional), no -u: collapsed untracked and ignored dirs",
			argv: ["status", "-s", "-z", "--ignored", "--", "proj/module"],
			arcReplies: {
				"status -s proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/\n",
				},
				"status -s --ignored -u normal proj/module": { stdout: "!! proj/module/build/\n" },
			},
			want: {
				stdout: "A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/\0!! proj/module/build/\0",
				code: 0,
			},
		},
		{
			name: "-uno + traditional: git shows no ignored entries (no ignored call)",
			argv: ["status", "-s", "-z", "--ignored=traditional", "-uno", "--", "proj/module"],
			arcReplies: {
				"status -s -u no proj/module": { stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n" },
			},
			want: { stdout: "A  proj/module/new.txt\0 M proj/module/src/base.ts\0", code: 0 },
		},
		{
			name: "--ignored=no is a no-op: single passthrough call",
			argv: [
				"status",
				"--porcelain=v1",
				"-z",
				"--no-renames",
				"--ignored=no",
				"--untracked-files=all",
				"--",
				"proj/module",
			],
			arcReplies: {
				"status -s -u all proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
			},
			want: {
				stdout: "A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/x.txt\0",
				code: 0,
			},
		},
		{
			name: "nonexistent pathspec: empty output, exit 0 (git-verified)",
			argv: [
				"status",
				"--no-renames",
				"--ignored=matching",
				"--untracked-files=all",
				"--porcelain=v1",
				"-z",
				"--",
				"proj/module/nosuch",
			],
			arcReplies: {
				"status -s -u all proj/module/nosuch": { stdout: "" },
				"status -s --ignored -u normal proj/module/nosuch": { stdout: "" },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "pathspec resolved against a subdir cwd (git cwd-relative specs)",
			argv: ["status", "--ignored=matching", "--untracked-files=all", "--porcelain=v1", "-z", "--", "module"],
			cwd: "/arcadia/proj",
			arcReplies: {
				"status -s -u all proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
				"status -s --ignored -u normal proj/module": {
					stdout: "!! proj/module/build/\n!! proj/module/scratch/dead.tmp\n",
				},
			},
			want: {
				stdout:
					"A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/x.txt\0" +
					"!! proj/module/build/\0!! proj/module/scratch/dead.tmp\0",
				code: 0,
			},
		},
		{
			name: "absolute pathspec inside the root normalizes to root-relative",
			argv: ["status", "--ignored=matching", "--untracked-files=all", "--porcelain=v1", "-z", "--", "/arcadia/proj/module"],
			arcReplies: {
				"status -s -u all proj/module": {
					stdout: "A  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
				"status -s --ignored -u normal proj/module": {
					stdout: "!! proj/module/build/\n!! proj/module/scratch/dead.tmp\n",
				},
			},
			want: {
				stdout:
					"A  proj/module/new.txt\0 M proj/module/src/base.ts\0?? proj/module/scratch/x.txt\0" +
					"!! proj/module/build/\0!! proj/module/scratch/dead.tmp\0",
				code: 0,
			},
		},
		{
			name: "-b branch header passes the pathspec filter untouched",
			argv: ["status", "--ignored=matching", "--untracked-files=all", "--porcelain=v1", "-z", "-b", "--", "proj/module"],
			arcReplies: {
				"status -s -b -u all proj/module": {
					stdout: "## feature-x...arcadia/users/darl/feature-x\nA  proj/module/new.txt\n M proj/module/src/base.ts\n?? proj/module/scratch/x.txt\n",
				},
				"status -s --ignored -u normal proj/module": { stdout: "!! proj/module/build/\n" },
			},
			want: {
				stdout:
					"## feature-x...arcadia/users/darl/feature-x\0A  proj/module/new.txt\0 M proj/module/src/base.ts\0" +
					"?? proj/module/scratch/x.txt\0!! proj/module/build/\0",
				code: 0,
			},
		},
		{
			name: "multiple pathspecs union, component boundaries respected",
			argv: [
				"status",
				"--porcelain",
				"-z",
				"--ignored=matching",
				"--untracked-files=all",
				"--",
				"proj/module",
				"proj/other",
			],
			arcReplies: {
				"status -s -u all proj/module proj/other": {
					stdout: " M proj/module/src/base.ts\n M proj/other/lib/x.txt\nA  proj/other/new.txt\n",
				},
				"status -s --ignored -u normal proj/module proj/other": {
					stdout: "!! proj/module/build/\n!! proj/other/lib/dead.o\n",
				},
			},
			want: {
				stdout:
					" M proj/module/src/base.ts\0 M proj/other/lib/x.txt\0A  proj/other/new.txt\0" +
					"!! proj/module/build/\0!! proj/other/lib/dead.o\0",
				code: 0,
			},
		},
	],
})
