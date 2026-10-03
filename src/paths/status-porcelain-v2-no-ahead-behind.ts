// git status --porcelain=v2 [--branch] --no-ahead-behind — the cheap variant
// of status-porcelain-v2. GOLDEN (probed on real git 2.34.1): --no-ahead-behind
// does NOT drop the branch.ab header — it prints literal placeholders
// "# branch.ab +? -?" and skips computing the counts entirely (that is the
// flag's purpose: status without the ahead/behind walk). branch.upstream is
// still printed, and with no upstream neither upstream nor ab lines appear.
// The shim mirrors that exactly — and, crucially, makes NO arc log range
// calls (the two countRange walks that status-porcelain-v2 pays for), so
// this stays a single info + single status poll. Entry lines are identical
// to status-porcelain-v2 (synthetic mode 100644 / zero OIDs — arc exposes
// neither).
import { arcInfo, arcJson, definePath, isDetached, isExecResult, ok, statusLetter } from "../core"

const Z40 = "0".repeat(40)

interface Entry {
	status: string
	path: string
}

export default definePath({
	name: "status-porcelain-v2-no-ahead-behind",
	summary: "porcelain v2 with --no-ahead-behind (ab header as +? -?, no count walks)",
	// --no-ahead-behind is the required distinguishing token: without it every
	// argv here would collide with status-porcelain-v2 (equal or broader spec);
	// with it, no existing path can account for the token, so no overlap.
	// git accepts both --porcelain=v2 and --porcelain=2 (the "v" is optional).
	spec: "status --porcelain=(v2|2) --no-ahead-behind --branch? --untracked-files=(all|no|normal)? (-uall|-uno)?",

	async run(args, ctx) {
		const uMode =
			args.flags.has("--untracked-files=all") || args.flags.has("-uall")
				? "all"
				: args.flags.has("--untracked-files=no") || args.flags.has("-uno")
					? "no"
					: "normal"
		const stPromise = arcJson<{ status?: Record<string, Entry[]> }>(ctx, ["status", "--json", "-u", uMode], {
			cwd: ctx.arcRoot,
		})
		const lines: string[] = []

		if (args.flags.has("--branch")) {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			lines.push(`# branch.oid ${info.hash ?? Z40}`)
			// arc reports detachment as a missing branch field OR a bare 40-hex
			// hash in it; git prints "(detached)" either way
			lines.push(`# branch.head ${isDetached(info.branch) ? "(detached)" : info.branch}`)
			// --no-ahead-behind: upstream line stays, counts become "?" — and
			// no countRange walks happen at all (the flag's raison d'être).
			if (info.remote) {
				lines.push(`# branch.upstream arcadia/${info.remote}`)
				lines.push("# branch.ab +? -?")
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
		// -uno must emit no untracked lines even if arc returns some
		if (uMode !== "no")
			for (const e of (parsed.status?.untracked ?? []).slice().sort((a, b) => (a.path < b.path ? -1 : 1)))
				lines.push(`? ${e.path}`)

		return ok(lines.length ? lines.join("\n") + "\n" : "")
	},

	fixtures: [
		{
			name: "exact incoming command: --porcelain=2 --branch --no-ahead-behind",
			argv: ["status", "--porcelain=2", "--branch", "--no-ahead-behind"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}',
				},
				"status --json -u normal": {
					stdout:
						'{"status":{"staged":[{"status":"new file","type":"file","path":"junk/darl/new.txt"}],"untracked":[{"status":"untracked","type":"file","path":"junk/darl/scratch.txt"}]}}',
				},
			},
			want: {
				stdout:
					"# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\n" +
					"# branch.head feature-x\n" +
					"# branch.upstream arcadia/users/darl/feature-x\n" +
					"# branch.ab +? -?\n" +
					`1 A. N... 100644 100644 100644 ${Z40} ${Z40} junk/darl/new.txt\n` +
					"? junk/darl/scratch.txt\n",
				code: 0,
			},
		},
		{
			name: "no upstream: no upstream/ab headers; clean tree",
			argv: ["status", "--porcelain=v2", "--branch", "--no-ahead-behind"],
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
			name: "--no-ahead-behind without --branch is a plain v2 status",
			argv: ["status", "--porcelain=v2", "--no-ahead-behind", "-uno"],
			arcReplies: {
				"status --json -u no": {
					stdout: '{"status":{"untracked":[{"status":"untracked","type":"file","path":"junk/darl/x.txt"}]}}',
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "detached HEAD renders (detached), no ab lines",
			argv: ["status", "--porcelain=v2", "--branch", "--no-ahead-behind"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout: "# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\n# branch.head (detached)\n",
				code: 0,
			},
		},
		{
			name: "modified staged+unstaged same file, with --untracked-files=all",
			argv: ["status", "--porcelain=2", "--no-ahead-behind", "--untracked-files=all"],
			arcReplies: {
				"status --json -u all": {
					stdout:
						'{"status":{"staged":[{"status":"modified","type":"file","path":"a/b.txt"}],"changed":[{"status":"modified","type":"file","path":"a/b.txt"}]}}',
				},
			},
			want: {
				stdout: `1 MM N... 100644 100644 100644 ${Z40} ${Z40} a/b.txt\n`,
				code: 0,
			},
		},
		{
			name: "arc failure passes through",
			argv: ["status", "--porcelain=v2", "--no-ahead-behind"],
			arcReplies: {
				"status --json -u normal": { stderr: "error: arc failed\n", code: 1 },
			},
			want: { stderr: "error: arc failed\n", code: 1 },
		},
	],
})
