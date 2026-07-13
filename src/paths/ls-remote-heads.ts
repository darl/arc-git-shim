// git ls-remote --heads [<remote>] [<patterns>...] → list remote branch heads.
//
// arc has no "ls-remote"; its branch model IS the remote ref set. `arc branch
// -av --json` reports every server-known branch (local + remote-tracking) with
// a commit id. Remote-tracking entries carry `local: null` and a `name` that
// begins with the remote prefix `arcadia/`; stripping that yields the bare ref
// path, which maps to git's `refs/heads/<path>`.
//
// The only remote is "arcadia" ("origin" silently accepted). This path declares
// ONLY the --heads shape; --tags / no-filter ls-remote fall through to learning.
import { arcJson, definePath, isExecResult, isRemoteAlias, ok } from "../core"

interface ArcBranch {
	local?: boolean | null
	name: string
	commit?: { id?: string }
}

const GLOB_CHARS = /[*?]/

/** fnmatch-style glob → anchored regex (* = .*, ? = .). */
function globToRe(glob: string): RegExp {
	let re = ""
	for (const ch of glob) {
		if (ch === "*") re += ".*"
		else if (ch === "?") re += "."
		else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&")
	}
	return new RegExp("^" + re + "$")
}

/** git ls-remote pattern semantics: a bare (globless) pattern matches the full
 * ref OR refs/heads/<pattern>; a glob pattern is wildmatched against the full
 * refname. */
function refMatches(ref: string, pattern: string): boolean {
	if (GLOB_CHARS.test(pattern)) return globToRe(pattern).test(ref)
	return ref === pattern || ref === `refs/heads/${pattern}`
}

export default definePath({
	name: "ls-remote-heads",
	summary: "remote branch heads via arc branch -av --json",
	spec: "ls-remote --heads <remote> <patterns...>?",
	refine: (args) => isRemoteAlias(args.pos.remote!),

	async run(args, ctx) {
		const branches = await arcJson<ArcBranch[]>(ctx, ["branch", "-av", "--json"])
		if (isExecResult(branches)) return branches

		// Remote-tracking entries (local falsy) carry the canonical remote ref
		// in `name` prefixed by the remote name; strip `arcadia/` → ref path.
		let refs = branches
			.filter((b) => !b.local && b.commit?.id && b.name.startsWith("arcadia/"))
			.map((b) => ({ ref: `refs/heads/${b.name.slice("arcadia/".length)}`, hash: b.commit!.id! }))

		const patterns = args.list.patterns ?? []
		if (patterns.length > 0) refs = refs.filter((r) => patterns.some((p) => refMatches(r.ref, p)))

		refs.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))

		if (refs.length === 0) return ok("")
		return ok(refs.map((r) => `${r.hash}\t${r.ref}`).join("\n") + "\n")
	},

	fixtures: [
		{
			name: "exact pattern match",
			argv: ["ls-remote", "--heads", "origin", "test-wt"],
			arcReplies: {
				"branch -av --json": {
					stdout:
						'[' +
						'{"name":"arcadia/trunk","local":null,"commit":{"id":"8413edbd13cd068677098022e4948f9fa46dc7c2"}},' +
						'{"name":"arcadia/test-wt","local":null,"commit":{"id":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}},' +
						'{"name":"arcadia/users/darl/feature-x","local":null,"commit":{"id":"b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"}},' +
						'{"name":"agent-spawner-rng-fix","local":true,"remote":"arcadia/users/darl/agent-spawner-rng-fix","commit":{"id":"d37ffc32fc81f2bb26dbc9f5e4c9c964736c7910"}}' +
						']',
				},
			},
			want: { stdout: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/heads/test-wt\n", code: 0 },
		},
		{
			name: "no pattern lists all heads sorted",
			argv: ["ls-remote", "--heads", "arcadia"],
			arcReplies: {
				"branch -av --json": {
					stdout:
						'[' +
						'{"name":"arcadia/trunk","local":null,"commit":{"id":"8413edbd13cd068677098022e4948f9fa46dc7c2"}},' +
						'{"name":"arcadia/test-wt","local":null,"commit":{"id":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}},' +
						'{"name":"arcadia/users/darl/feature-x","local":null,"commit":{"id":"b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"}},' +
						'{"name":"agent-spawner-rng-fix","local":true,"remote":"arcadia/users/darl/agent-spawner-rng-fix","commit":{"id":"d37ffc32fc81f2bb26dbc9f5e4c9c964736c7910"}}' +
						']',
				},
			},
			want: {
				stdout:
					"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2\trefs/heads/test-wt\n" +
					"8413edbd13cd068677098022e4948f9fa46dc7c2\trefs/heads/trunk\n" +
					"b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3\trefs/heads/users/darl/feature-x\n",
				code: 0,
			},
		},
		{
			name: "pattern matches nothing → empty, exit 0",
			argv: ["ls-remote", "--heads", "origin", "no-such-branch"],
			arcReplies: {
				"branch -av --json": {
					stdout:
						'[{"name":"arcadia/trunk","local":null,"commit":{"id":"8413edbd13cd068677098022e4948f9fa46dc7c2"}}]',
				},
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "glob pattern against full refname",
			argv: ["ls-remote", "--heads", "origin", "refs/heads/tr*"],
			arcReplies: {
				"branch -av --json": {
					stdout:
						'[' +
						'{"name":"arcadia/trunk","local":null,"commit":{"id":"8413edbd13cd068677098022e4948f9fa46dc7c2"}},' +
						'{"name":"arcadia/test-wt","local":null,"commit":{"id":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"}}' +
						']',
				},
			},
			want: { stdout: "8413edbd13cd068677098022e4948f9fa46dc7c2\trefs/heads/trunk\n", code: 0 },
		},
	],
})
