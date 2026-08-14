// git status --porcelain=v2 [--branch] -z [--renames|--no-renames] [-u…].
// -z NUL-terminates each entry (including branch headers) instead of LF and
// disables C-quoting of paths.  The entry structure is identical to the
// non-z porcelain-v2 path (synthetic mode 100644 / zero OIDs — arc exposes
// neither); only the terminator changes.  --renames/--no-renames are no-ops:
// arc status --json never detects renames, so entries are already separate.
import { arcInfo, arcJson, countRange, definePath, isDetached, isExecResult, ok, statusLetter } from "../core"

const Z40 = "0".repeat(40)

interface Entry {
	status: string
	path: string
}

export default definePath({
	name: "status-porcelain-v2-z",
	summary: "porcelain v2 with -z (NUL-terminated) via arc status --json",
	// -z is required (distinguishes from the non-z status-porcelain-v2 path);
	// --porcelain=(v2|2) accepts both the "v" and numeric forms git allows.
	spec: "status --porcelain=(v2|2) -z --branch? --renames? --no-renames? --untracked-files=(all|no|normal)? (-uall|-uno)?",

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
			lines.push(`# branch.head ${isDetached(info.branch) ? "(detached)" : info.branch}`)
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
			lines.push(`1 ${x}${y} N... 100644 100644 100644 ${Z40} ${Z40} ${p}`)
		}
		if (uMode !== "no")
			for (const e of (parsed.status?.untracked ?? []).slice().sort((a, b) => (a.path < b.path ? -1 : 1)))
				lines.push(`? ${e.path}`)

		// -z: NUL-terminate every entry instead of LF (including the last).
		return ok(lines.length ? lines.join("\0") + "\0" : "")
	},

	fixtures: [
		{
			name: "exact incoming command: --porcelain=v2 --branch -z",
			argv: ["status", "--porcelain=v2", "--branch", "-z"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"feature-x","remote":"users/darl/feature-x","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0","user_login":"darl"}',
				},
				"log --format={commit} -n 1000 arcadia/users/darl/feature-x..HEAD": { stdout: "aaa\nbbb\n" },
				"log --format={commit} -n 1000 HEAD..arcadia/users/darl/feature-x": { stdout: "" },
				"status --json -u normal": {
					stdout:
						'{"status":{"staged":[{"status":"new file","type":"file","path":"junk/darl/new.txt"}],"untracked":[{"status":"untracked","type":"file","path":"junk/darl/scratch.txt"}]}}',
				},
			},
			want: {
				stdout:
					"# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\0" +
					"# branch.head feature-x\0" +
					"# branch.upstream arcadia/users/darl/feature-x\0" +
					"# branch.ab +2 -0\0" +
					`1 A. N... 100644 100644 100644 ${Z40} ${Z40} junk/darl/new.txt\0` +
					"? junk/darl/scratch.txt\0",
				code: 0,
			},
		},
		{
			name: "no upstream: no ab header; clean tree (NUL-terminated)",
			argv: ["status", "--porcelain=v2", "--branch", "-z"],
			arcReplies: {
				"info --json": {
					stdout: '{"branch":"local-only","hash":"c79064cbea91ca389afe153a347d588452fe50df"}',
				},
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout:
					"# branch.oid c79064cbea91ca389afe153a347d588452fe50df\0" +
					"# branch.head local-only\0",
				code: 0,
			},
		},
		{
			name: "-uno suppresses untracked lines, NUL-terminated",
			argv: ["status", "--porcelain=v2", "-z", "-uno"],
			arcReplies: {
				"status --json -u no": {
					stdout: '{"status":{"untracked":[{"status":"untracked","type":"file","path":"junk/darl/x.txt"}]}}',
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "detached HEAD with -z",
			argv: ["status", "--porcelain=v2", "--branch", "-z"],
			arcReplies: {
				"info --json": {
					stdout:
						'{"branch":"a7819db772eed4b7b5a49b558b22f185464b80a0","hash":"a7819db772eed4b7b5a49b558b22f185464b80a0"}',
				},
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: {
				stdout: "# branch.oid a7819db772eed4b7b5a49b558b22f185464b80a0\0# branch.head (detached)\0",
				code: 0,
			},
		},
		{
			name: "numeric --porcelain=2 alias with -z, clean tree",
			argv: ["status", "--porcelain=2", "-z"],
			arcReplies: {
				"status --json -u normal": { stdout: '{"status":{}}' },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "modified staged+unstaged same file, NUL-terminated",
			argv: ["status", "--porcelain=v2", "-z"],
			arcReplies: {
				"status --json -u normal": {
					stdout:
						'{"status":{"staged":[{"status":"modified","type":"file","path":"a/b.txt"}],"changed":[{"status":"modified","type":"file","path":"a/b.txt"}]}}',
				},
			},
			want: {
				stdout: `1 MM N... 100644 100644 100644 ${Z40} ${Z40} a/b.txt\0`,
				code: 0,
			},
		},
		{
			name: "--no-renames (no-op) with -z and -u=all",
			argv: ["status", "--porcelain=v2", "-z", "--no-renames", "--untracked-files=all"],
			arcReplies: {
				"status --json -u all": {
					stdout:
						'{"status":{"untracked":[{"status":"untracked","type":"file","path":"dir/sub/file.txt"}]}}',
				},
			},
			want: { stdout: "? dir/sub/file.txt\0", code: 0 },
		},
	],
})
