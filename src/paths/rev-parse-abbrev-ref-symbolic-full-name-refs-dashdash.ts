// git rev-parse --abbrev-ref --symbolic-full-name @ @{u} --
//   → one line per ref in argv order (branch name for @/HEAD, the abbreviated
//     upstream tracking ref for the @{u} family), then a literal "--" line,
//     then every post-separator path arg echoed verbatim (real git echoes
//     them WITHOUT checking they exist, exit 0).  This is the scripted
//     "branch, upstream, then pathspecs" probe shape; the single-ref variant
//     without the separator is rev-parse-abbrev-ref-symbolic-full-name.
//
// Like that sibling: --abbrev-ref wins over --symbolic-full-name (git prints
// the short form), --abbref-ref is accepted as a common one-letter typo, and
// stdout always reports FULL explicit refs — the upstream line carries the
// arcadia/ prefix arc info's "remote" field lacks.
//
// Failure byte-shapes probed against real git: a ref that cannot resolve
// fatals 128 and stops output — lines already printed stay on stdout, and
// neither "--" nor later args are emitted.  Detached HEAD + @{u} is
// "fatal: HEAD does not point to a branch"; a branch without upstream is
// "fatal: no upstream configured for branch '<branch>'".
import { arcInfo, definePath, isDetached, isExecResult, ok, type ExecResult } from "../core"

/** Refs we can resolve symbolically from arc info --json alone. */
const SUPPORTED = new Set(["HEAD", "@", "@{u}", "@{upstream}", "HEAD@{u}", "HEAD@{upstream}"])

/** git's behavior on a bad ref mid-argv: keep what was printed, exit 128. */
const partial = (out: string[], stderr: string): ExecResult => ({
	stdout: out.length > 0 ? out.join("\n") + "\n" : "",
	stderr,
	code: 128,
})

export default definePath({
	name: "rev-parse-abbrev-ref-symbolic-full-name-refs-dashdash",
	summary: "abbrev-ref + symbolic-full-name over refs, -- separator, echoed paths",
	// `--` is REQUIRED: the bare multi-ref shape (no separator) is a different
	// invocation and keeps falling through to future learning.
	spec: "rev-parse (--abbrev-ref|--abbref-ref) --symbolic-full-name <ref> <ref2>? -- <path...>?",
	refine: (args) => SUPPORTED.has(args.pos.ref!) && (args.pos.ref2 === undefined || SUPPORTED.has(args.pos.ref2)),

	async run(args, ctx) {
		const info = await arcInfo(ctx)
		if (isExecResult(info)) return info
		const detached = isDetached(info.branch)
		const branch = detached ? "HEAD" : info.branch!
		const out: string[] = []
		for (const ref of [args.pos.ref!, args.pos.ref2].filter((r): r is string => r !== undefined)) {
			if (ref === "HEAD" || ref === "@") {
				out.push(branch)
				continue
			}
			// @{u} family → abbreviated upstream tracking ref
			if (detached) return partial(out, "fatal: HEAD does not point to a branch\n")
			if (!info.remote) return partial(out, `fatal: no upstream configured for branch '${branch}'\n`)
			out.push(`arcadia/${info.remote}`)
		}
		out.push("--", ...(args.list.path ?? []))
		return ok(out.join("\n") + "\n")
	},

	fixtures: [
		{
			name: "branch, upstream, separator",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@", "@{u}", "--"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "feature-x\narcadia/users/darl/feature-x\n--\n", code: 0 },
		},
		{
			name: "path args after -- echoed verbatim, existence unchecked",
			argv: [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				"HEAD",
				"@{upstream}",
				"--",
				"dir/sub/file.txt",
				"missing.txt",
			],
			arcReplies: {
				"info --json": {
					stdout: '{"branch":"pr-12345678","remote":"users/darl/submit-1234","user_login":"darl"}',
				},
			},
			want: {
				stdout: "pr-12345678\narcadia/users/darl/submit-1234\n--\ndir/sub/file.txt\nmissing.txt\n",
				code: 0,
			},
		},
		{
			name: "single ref before -- still prints the separator",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@", "--"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"feature-x","remote":"trunk","user_login":"darl"}' },
			},
			want: { stdout: "feature-x\n--\n", code: 0 },
		},
		{
			name: "argv order preserved: upstream ref first",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "HEAD@{u}", "@", "--"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"trunk","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "arcadia/trunk\nfeature-x\n--\n", code: 0 },
		},
		{
			name: "typo --abbref-ref accepted",
			argv: ["rev-parse", "--abbref-ref", "--symbolic-full-name", "@", "@{u}", "--"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","user_login":"darl","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
			},
			want: { stdout: "feature-x\narcadia/users/darl/feature-x\n--\n", code: 0 },
		},
		{
			name: "no upstream: earlier line stays on stdout, no -- printed",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@", "@{u}", "--"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"local-only","user_login":"darl"}' },
			},
			want: {
				stdout: "local-only\n",
				stderr: "fatal: no upstream configured for branch 'local-only'\n",
				code: 128,
			},
		},
		{
			name: "detached HEAD: @ prints HEAD, @{u} fatals",
			argv: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@", "@{u}", "--"],
			arcReplies: {
				"info --json": { stdout: '{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}' },
			},
			want: {
				stdout: "HEAD\n",
				stderr: "fatal: HEAD does not point to a branch\n",
				code: 128,
			},
		},
	],
})
