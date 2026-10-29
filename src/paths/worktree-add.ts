// git worktree add [--no-track] -b <br> <path> [<base>] → the arc-mount
// lifecycle (orca crutch, ticket "Decide the orca compatibility bar"):
//   1. arc mount <path>            (FUSE mount; seconds–tens of seconds)
//   2. arc checkout -b <br> [<base>]   — run INSIDE the mount
//   2b. if checkout fails: arc unmount --force + --forget, so nothing is left
//       behind (git worktree add is atomic) and the arc error is reported.
// The branch is created EXACTLY as asked — no users/<login>/ lens here. Tools
// remember the name they passed to -b (t3code stores it and compares against
// status branch.head verbatim); the users/ prefix is a REMOTE-side concept
// that push.ts injects at publish time. Lensing at creation broke that
// contract and hid t3code's PR links.
//
// SHARED-STORE MODE (the ai/tools/arc_worktree "mount-shared" pattern): when
// both shim-config keys are set —
//   git config arcgit.storesbase  <dir>   # per-mount stores live under here
//   git config arcgit.objectstore <dir>   # ONE object store for all mounts
// — the mount gets `-S <storesbase>/<name> --object-store <objectstore>`, so
// objects download once and worktrees stop costing ~10 GB each. The shared
// object store is deliberately standalone (owned by no mount): a store owned
// by a mount would die with that mount's `unmount --forget`.
// Without the keys: plain isolated-store mount (original behavior).
import { arcRev, definePath, fail, isExecResult, ok } from "../core"
import { listBranches, type BranchEntry } from "../refs"

export default definePath({
	name: "worktree-add",
	summary: "arc mount (shared object store if configured) + branch checkout",
	spec: "worktree add --no-track? --detach? (--quiet|-q)? -b=<branch>? --? <path> <base>?",

	async run(args, ctx) {
		const mountPath = args.pos.path!
		const base = args.pos.base !== undefined ? arcRev(args.pos.base) : undefined
		let sourceBranch: BranchEntry | undefined
		if (args.pos.branch === undefined && !args.flags.has("--detach") && base !== undefined && !/^[a-f0-9]{40}$/.test(base)) {
			const branches = await listBranches(ctx, "-v")
			if (isExecResult(branches)) return branches
			sourceBranch = branches.find(b => b.local && b.name === base)
			if (sourceBranch && !/^[a-f0-9]{40}$/.test(sourceBranch.commit?.id ?? ""))
				return fail(128, `fatal: cannot resolve branch '${base}' before creating worktree\n`)
		}
		const storesBase = ctx.config.get("arcgit.storesbase")
		const objectStore = ctx.config.get("arcgit.objectstore")
		const mountArgs = ["mount", mountPath]
		if (storesBase && objectStore) {
			// arc-wt's mount-shared argv shape: mount -m <path> -S <store> --object-store <obj>
			const name = mountPath.split("/").filter(Boolean).pop()!
			mountArgs.splice(1, 0, "-m")
			mountArgs.push("-S", `${storesBase}/${name}`, "--object-store", objectStore)
		}
		const m = await ctx.arc(mountArgs)
		if (m.code !== 0) return m
		const co =
			args.pos.branch !== undefined
				? ["checkout", "-b", args.pos.branch, ...(base !== undefined ? [base] : [])]
				: base !== undefined
					? ["checkout", base]
					: null
		const commands = co === null ? [] : [co]
		if (sourceBranch) {
			// Arc mounts have independent branch stores; pin the source tip before mounting.
			// Detach first so even the fresh mount's existing trunk can be reset safely.
			commands.splice(0, commands.length,
				["checkout", sourceBranch.commit!.id!],
				["branch", "--force", sourceBranch.name, sourceBranch.commit!.id!],
				["checkout", sourceBranch.name],
			)
			if (sourceBranch.remote)
				commands.push(["branch", "-u", arcRev(sourceBranch.remote).replace(/^arcadia\//, ""), sourceBranch.name])
		}
		for (const command of commands) {
			const c = await ctx.arc(command, { cwd: mountPath })
			if (c.code !== 0) {
				await ctx.arc(["unmount", "--force", mountPath], { cwd: "/" })
				await ctx.arc(["unmount", "--forget", mountPath], { cwd: "/" })
				return { ...c, stderr: `fatal: arc ${command.join(" ")} failed in '${mountPath}':\n${c.stderr}` }
			}
		}
		if (args.flags.has("--quiet") || args.flags.has("-q")) return ok()
		return ok(`Preparing worktree (new branch '${args.pos.branch ?? args.pos.base ?? "trunk"}')\n`)
	},

	fixtures: [
		{
			"name": "existing local branch transferred into private store: t3/repro",
			"argv": [
				"worktree",
				"add",
				"--",
				"/wt/repro",
				"t3/repro"
			],
			"arcReplies": {
				"branch -v --json": {
					"stdout": "[{\"name\": \"t3/repro\", \"local\": true, \"commit\": {\"id\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}]"
				},
				"mount /wt/repro": {},
				"checkout aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {},
				"branch --force t3/repro aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {},
				"checkout t3/repro": {}
			},
			"want": {
				"code": 0,
				"stdout": "Preparing worktree (new branch 't3/repro')\n"
			}
		},
		{
			"name": "existing local branch transferred into private store: trunk",
			"argv": [
				"worktree",
				"add",
				"--",
				"/wt/repro",
				"trunk"
			],
			"arcReplies": {
				"branch -v --json": {
					"stdout": "[{\"name\": \"trunk\", \"local\": true, \"commit\": {\"id\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}, \"remote\": \"arcadia/trunk\"}]"
				},
				"mount /wt/repro": {},
				"checkout aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {},
				"branch --force trunk aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {},
				"checkout trunk": {},
				"branch -u trunk trunk": {}
			},
			"want": {
				"code": 0,
				"stdout": "Preparing worktree (new branch 'trunk')\n"
			}
		},
		{
			"name": "branch listing failure prevents mount",
			"argv": [
				"worktree",
				"add",
				"--",
				"/wt/repro",
				"t3/repro"
			],
			"arcReplies": {
				"branch -v --json": {
					"code": 1,
					"stderr": "mount unavailable\n"
				}
			},
			"want": {
				"code": 1,
				"stderr": "mount unavailable\n"
			}
		},
		{
			"name": "branch transfer failure removes fresh mount",
			"argv": [
				"worktree",
				"add",
				"--",
				"/wt/repro",
				"t3/repro"
			],
			"arcReplies": {
				"branch -v --json": {
					"stdout": "[{\"local\": true, \"name\": \"t3/repro\", \"commit\": {\"id\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}]"
				},
				"mount /wt/repro": {},
				"checkout aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {},
				"branch --force t3/repro aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
					"code": 1,
					"stderr": "cannot create branch\n"
				},
				"unmount --force /wt/repro": {},
				"unmount --forget /wt/repro": {}
			},
			"want": {
				"code": 1,
				"stderr": "fatal: arc branch --force t3/repro aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa failed in '/wt/repro':\ncannot create branch\n"
			}
		},
		{
			"name": "T3 option separator with shared-store branch checkout",
			"argv": [
				"worktree",
				"add",
				"-b",
				"task-example",
				"--",
				"/wt/task-example",
				"trunk"
			],
			"config": {
				"arcgit.storesbase": "/stores",
				"arcgit.objectstore": "/objects"
			},
			"arcReplies": {
				"mount -m /wt/task-example -S /stores/task-example --object-store /objects": {},
				"checkout -b task-example trunk": {}
			},
			"want": {
				"stdout": "Preparing worktree (new branch 'task-example')\n",
				"code": 0
			}
		},
		{
			name: "quiet detached review checkout",
			argv: ["worktree", "add", "--detach", "--quiet", "/wt/review-guide-example/checkout", "a".repeat(40)],
			arcReplies: {
				"mount /wt/review-guide-example/checkout": {},
				["checkout " + "a".repeat(40)]: {},
			},
			want: { stdout: "", stderr: "", code: 0 },
		},
		{
			name: "quiet checkout failure still reports and cleans up",
			argv: ["worktree", "add", "--detach", "-q", "/wt/review-guide-example/checkout", "a".repeat(40)],
			arcReplies: {
				"mount /wt/review-guide-example/checkout": {},
				["checkout " + "a".repeat(40)]: { code: 1, stderr: "unknown revision\n" },
				"unmount --force /wt/review-guide-example/checkout": {},
				"unmount --forget /wt/review-guide-example/checkout": {},
			},
			want: { code: 1, stderr: `fatal: arc checkout ${"a".repeat(40)} failed in '/wt/review-guide-example/checkout':\nunknown revision\n` },
		},
		{
			name: "shared-store mode: arc-wt mount-shared argv shape",
			argv: ["worktree", "add", "-b", "task-3", "/wt/task-3", "trunk"],
			config: { "arcgit.storesbase": "/home/u/.arc/stores", "arcgit.objectstore": "/home/u/arc_obj_store" },
			arcReplies: {
				"mount -m /wt/task-3 -S /home/u/.arc/stores/task-3 --object-store /home/u/arc_obj_store": {},
				"checkout -b task-3 trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 'task-3')\n", code: 0 },
		},
		{
			name: "branch created verbatim (t3code stores the name it asked for)",
			argv: ["worktree", "add", "--no-track", "-b", "t3code/1479713b", "/wt/t3code-1479713b", "trunk"],
			arcReplies: {
				"mount /wt/t3code-1479713b": {},
				"checkout -b t3code/1479713b trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 't3code/1479713b')\n", code: 0 },
		},
		{
			name: "already-prefixed branch also verbatim",
			argv: ["worktree", "add", "-b", "users/darl/task-2", "/wt/task-2"],
			arcReplies: {
				"mount /wt/task-2": {},
				"checkout -b users/darl/task-2": {},
			},
			want: { stdout: "Preparing worktree (new branch 'users/darl/task-2')\n", code: 0 },
		},
		{
			name: "orca qualified base normalized to arc's short form",
			argv: ["worktree", "add", "--no-track", "-b", "perf-task", "/wt/perf-task", "refs/remotes/arcadia/trunk"],
			arcReplies: {
				"mount /wt/perf-task": {},
				"checkout -b perf-task arcadia/trunk": {},
			},
			want: { stdout: "Preparing worktree (new branch 'perf-task')\n", code: 0 },
		},
		{
			name: "checkout failure unmounts the fresh mount and reports the arc error",
			argv: ["worktree", "add", "--no-track", "-b", "t3code/abc", "/wt/t3code-abc", "0123abcd"],
			arcReplies: {
				"mount /wt/t3code-abc": {},
				"checkout -b t3code/abc 0123abcd": { stderr: "Error: unknown revision '0123abcd'\n", code: 1 },
				"unmount --force /wt/t3code-abc": {},
				"unmount --forget /wt/t3code-abc": {},
			},
			want: {
				stderr:
					"fatal: arc checkout -b t3code/abc 0123abcd failed in '/wt/t3code-abc':\nError: unknown revision '0123abcd'\n",
				code: 1,
			},
		},
		{
			name: "mount failure propagates",
			argv: ["worktree", "add", "-b", "x", "/no/perm"],
			arcReplies: {
				"mount /no/perm": { stderr: "Error: cannot mount\n", code: 1 },
			},
			want: { code: 1 },
		},
	],
})
