// orca's 3-second poll: status --porcelain=v2 --branch --untracked-files=all.
// Emulated from: arc info --json (oid/head/upstream) + arc status --json
// (entries; GOLDEN: {"status":{"staged":[{"status":"new file","type":"file",
// "path":"..."}],"untracked":[...]}} — root-relative paths) + two arc log
// range counts for ab. File modes and blob hashes are NOT available from arc:
// the shim emits synthetic mode 100644 and zero OIDs — v2 STRUCTURE is exact,
// those fields are placeholders (orca reads XY + path).
// "changed" is the assumed key for modified-unstaged entries (unverified
// against real arc — flagged for the acceptance ticket).
import { arcInfo, arcJson, countRange, definePath, isExecResult, ok, statusLetter } from "../core"

const Z40 = "0".repeat(40)

interface Entry {
	status: string
	path: string
}

export default definePath({
	name: "status-porcelain-v2",
	summary: "porcelain v2 with branch headers (orca poll)",
	spec: "status --porcelain=v2 --branch? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const uAll = args.flags.has("--untracked-files=all") || args.flags.has("-uall")
		// this is orca's 3-second poll — start the status call up front and run
		// the two range counts concurrently; only info→counts is a real dependency
		const stPromise = arcJson<{ status?: Record<string, Entry[]> }>(
			ctx,
			["status", "--json", "-u", uAll ? "all" : "normal"],
			{ cwd: ctx.arcRoot },
		)
		const lines: string[] = []

		if (args.flags.has("--branch")) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			lines.push(`# branch.oid ${info.hash ?? Z40}`)
			lines.push(`# branch.head ${info.branch ?? "(detached)"}`)
			if (info.remote) {
				const up = `arcadia/${info.remote}`
				lines.push(`# branch.upstream ${up}`)
				const [ahead, behind] = await Promise.all([countRange(ctx, `${up}..HEAD`), countRange(ctx, `HEAD..${up}`)])
				if (isExecResult(ahead)) return ahead
				if (isExecResult(behind)) return behind
				lines.push(`# branch.ab +${ahead} -${behind}`)
			}
		}

		const parsed = await stPromise
		if (isExecResult(parsed)) return parsed
		const staged = new Map((parsed.status?.staged ?? []).map((e) => [e.path, statusLetter(e.status)]))
		const changed = new Map((parsed.status?.changed ?? []).map((e) => [e.path, statusLetter(e.status)]))
		const tracked = [...new Set([...staged.keys(), ...changed.keys()])].sort()
		for (const p of tracked) {
			const x = staged.get(p) ?? "."
			const y = changed.get(p) ?? "."
			// synthetic modes/OIDs: arc exposes neither file modes nor blob hashes
			lines.push(`1 ${x}${y} N... 100644 100644 100644 ${Z40} ${Z40} ${p}`)
		}
		for (const e of (parsed.status?.untracked ?? []).slice().sort((a, b) => (a.path < b.path ? -1 : 1)))
			lines.push(`? ${e.path}`)

		return ok(lines.length ? lines.join("\n") + "\n" : "")
	},

	fixtures: [
		{
			name: "orca poll: branch headers + staged + untracked",
			argv: ["status", "--porcelain=v2", "--branch", "--untracked-files=all"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}',
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..HEAD": { stdout: "aaa\nbbb\n" },
				"log --format={commit} -n 1000 HEAD..arcadia/users/darl/feature-x": { stdout: "" },
				"status --json -u all": {
					stdout:
						'{"status":{"staged":[{"status":"new file","type":"file","path":"junk/darl/new.txt"}],"untracked":[{"status":"untracked","type":"file","path":"junk/darl/scratch.txt"}]}}',
				},
			},
			want: {
				stdout:
					"# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\n" +
					"# branch.head feature-x\n" +
					"# branch.upstream arcadia/users/darl/feature-x\n" +
					"# branch.ab +2 -0\n" +
					`1 A. N... 100644 100644 100644 ${Z40} ${Z40} junk/darl/new.txt\n` +
					"? junk/darl/scratch.txt\n",
				code: 0,
			},
		},
		{
			name: "no upstream: no ab header; clean tree",
			argv: ["status", "--porcelain=v2", "--branch"],
			arcReplies: {
				"info --json": {
					stdout: '{"branch":"local-only","hash":"c79064cbea91ca389afe153a347d588452fe50df"}',
				},
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout:
					"# branch.oid c79064cbea91ca389afe153a347d588452fe50df\n" +
					"# branch.head local-only\n",
				code: 0,
			},
		},
		{
			name: "modified staged+unstaged same file",
			argv: ["status", "--porcelain=v2"],
			arcReplies: {
				"status --json -u normal": {
					stdout:
						'{"status":{"staged":[{"status":"modified","type":"file","path":"a/b.txt"}],"changed":[{"status":"modified","type":"file","path":"a/b.txt"}]}}',
				},
			},
			want: {
				stdout: `1 MM N... 100644 100644 100644 ${Z40} ${Z40} a/b.txt\n`,
				code: 0,
			},
		},
	],
})
