// Resolve a verified revision to a full ref name; commit expressions have no symbolic name.
import { arcInfo, arcRev, definePath, isDetached, isExecResult, isPrivateRef, ok } from "../core"
import { entryRefname, listBranches } from "../refs"
import verify from "./rev-parse-verify"

export default definePath({
	name: "rev-parse-symbolic-verify",
	summary: "verified full branch ref, or empty output for a commit expression",
	spec: "rev-parse --symbolic-full-name --verify? (--quiet|-q)? --end-of-options? <ref>",

	async run(args, ctx) {
		const ref = args.pos.ref === "@" ? "HEAD" : args.pos.ref!
		const verified = await verify.run({ ...args, pos: { ...args.pos, ref } }, ctx)
		if (verified.code !== 0) return verified
		if (isPrivateRef(ref)) return ok(ref + "\n")
		if (ref === "HEAD") {
			const info = await arcInfo(ctx)
			if (isExecResult(info)) return info
			return ok(isDetached(info.branch) ? "HEAD\n" : `refs/heads/${info.branch}\n`)
		}
		// Peeling and ancestry operators resolve to objects, not named refs.
		if (/[~^@:]/.test(ref)) return ok()
		const branches = await listBranches(ctx, "-a")
		if (isExecResult(branches)) return branches
		const normalized = arcRev(ref)
		const branch = branches.find(b => {
			if (ref.startsWith("refs/heads/")) return b.local && b.name === normalized
			if (ref.startsWith("refs/remotes/")) return !b.local && b.name === normalized
			return b.name === normalized
		})
		return ok(branch ? entryRefname(branch) + "\n" : "")
	},

	fixtures: [
		{
			"name": "T3 resolves raw commit without verify",
			"argv": [
				"rev-parse",
				"--symbolic-full-name",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
			],
			"arcReplies": {
				"rev-parse aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
					"stdout": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
				},
				"branch -a --json": {
					"stdout": "[]"
				}
			},
			"want": {
				"stdout": "",
				"code": 0
			}
		},
		{
			"name": "T3 resolves remote without verify",
			"argv": [
				"rev-parse",
				"--symbolic-full-name",
				"origin/trunk"
			],
			"arcReplies": {
				"rev-parse arcadia/trunk": {
					"stdout": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
				},
				"branch -a --json": {
					"stdout": "[{\"name\":\"arcadia/trunk\"}]"
				}
			},
			"want": {
				"stdout": "refs/remotes/arcadia/trunk\n",
				"code": 0
			}
		},
		{
			name: "verified local branch with end-of-options",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", "trunk"],
			arcReplies: {
				"rev-parse trunk": { stdout: "a".repeat(40) + "\n" },
				"branch -a --json": { stdout: '[{"name":"trunk","local":true},{"name":"arcadia/trunk"}]' },
			},
			want: { stdout: "refs/heads/trunk\n", code: 0 },
		},
		{
			name: "origin alias resolves to canonical remote ref",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "origin/trunk"],
			arcReplies: {
				"rev-parse arcadia/trunk": { stdout: "a".repeat(40) + "\n" },
				"branch -a --json": { stdout: '[{"name":"trunk","local":true},{"name":"arcadia/trunk"}]' },
			},
			want: { stdout: "refs/remotes/arcadia/trunk\n", code: 0 },
		},
		{
			name: "commit hash has no symbolic output",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "a".repeat(40)],
			arcReplies: {
				["rev-parse " + "a".repeat(40)]: { stdout: "a".repeat(40) + "\n" },
				"branch -a --json": { stdout: '[{"name":"trunk","local":true}]' },
			},
			want: { stdout: "", code: 0 },
		},
		{
			name: "HEAD on a branch",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "HEAD"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "a".repeat(40) + "\n" },
				"info --json": { stdout: '{"branch":"feature-x"}' },
			},
			want: { stdout: "refs/heads/feature-x\n", code: 0 },
		},
		{
			name: "detached HEAD keeps its pseudo-ref name",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "HEAD"],
			arcReplies: {
				"rev-parse HEAD": { stdout: "a".repeat(40) + "\n" },
				"info --json": { stdout: JSON.stringify({ branch: "a".repeat(40) }) },
			},
			want: { stdout: "HEAD\n", code: 0 },
		},
		{
			name: "missing ref retains verification failure",
			argv: ["rev-parse", "--symbolic-full-name", "--verify", "--end-of-options", "missing"],
			arcReplies: { "rev-parse missing": { code: 1, stderr: "unknown revision\n" } },
			want: { stdout: "", stderr: "fatal: Needed a single revision\n", code: 128 },
		},
	],
})
