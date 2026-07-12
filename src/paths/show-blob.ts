// git show <rev>:<path> → raw blob bytes. GIT SEMANTICS: the path is
// repo-root-relative; a "./" prefix makes it cwd-relative. ARC BUG dodged:
// arc prepends the CWD to the whole "hash:path" argument when run from a
// subdirectory — so this path ALWAYS executes arc at the arc root with a
// root-relative path.
// ":path" (index blob, orca uses it) has no exact arc equivalent: try
// arc show :<path> first, fall back to HEAD:<path> — approximation, HEAD
// version differs from index when the file has staged-but-uncommitted edits.
import { definePath, fail, ok } from "../core"

function rootRelative(revpath: string, cwd: string, root: string): string {
	const i = revpath.indexOf(":")
	const rev = revpath.slice(0, i)
	let p = revpath.slice(i + 1)
	if (p.startsWith("./") || p.startsWith("../")) {
		const abs = new URL(p, `file://${cwd.endsWith("/") ? cwd : cwd + "/"}`).pathname
		p = abs.startsWith(root + "/") ? abs.slice(root.length + 1) : abs
	}
	return `${rev}:${p}`
}

export default definePath({
	name: "show-blob",
	summary: "raw blob at rev:path, executed at arc root",
	spec: "show --end-of-options? <revpath>",
	refine: (args) => args.pos.revpath!.includes(":"),

	async run(args, ctx) {
		const arg = rootRelative(args.pos.revpath!, ctx.cwd, ctx.arcRoot)
		const r = await ctx.arc(["show", arg], { cwd: ctx.arcRoot })
		if (r.code === 0) return ok(r.stdout)
		if (arg.startsWith(":")) {
			// index form unsupported by arc → HEAD approximation
			const r2 = await ctx.arc(["show", `HEAD${arg}`], { cwd: ctx.arcRoot })
			if (r2.code === 0) return ok(r2.stdout)
		}
		const p = arg.slice(arg.indexOf(":") + 1)
		return fail(128, `fatal: path '${p}' does not exist in '${arg.slice(0, arg.indexOf(":")) || "index"}'\n`)
	},

	fixtures: [
		{
			name: "root-relative blob",
			argv: ["show", "HEAD:devtools/ya/README.md"],
			arcReplies: {
				"show HEAD:devtools/ya/README.md": { stdout: "# ya\ncontents\n" },
			},
			want: { stdout: "# ya\ncontents\n", code: 0 },
		},
		{
			name: "./ prefix resolves against cwd",
			argv: ["show", "HEAD:./b.txt"],
			cwd: "/arcadia/junk/darl",
			arcReplies: {
				"show HEAD:junk/darl/b.txt": { stdout: "cwd-relative contents\n" },
			},
			want: { stdout: "cwd-relative contents\n", code: 0 },
		},
		{
			name: "index blob falls back to HEAD",
			argv: ["show", ":junk/darl/x.txt"],
			arcReplies: {
				"show :junk/darl/x.txt": { stderr: "Error: bad revision\n", code: 1 },
				"show HEAD:junk/darl/x.txt": { stdout: "head version\n" },
			},
			want: { stdout: "head version\n", code: 0 },
		},
		{
			name: "missing path is git-shaped fatal",
			argv: ["show", "HEAD:no/such/file"],
			arcReplies: {
				"show HEAD:no/such/file": { stderr: "Error: path not found\n", code: 1 },
			},
			want: { stdout: "", stderr: "fatal: path 'no/such/file' does not exist in 'HEAD'\n", code: 128 },
		},
	],
})
