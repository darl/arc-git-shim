// git config --path: the one config read that post-processes the value — a
// leading ~/ (or bare ~) expands to the invoking user's home before printing,
// otherwise the value passes through untouched. Agent tooling probes
// core.excludesfile with exactly `config -z --path --get` to locate the
// global ignore file, so the byte shape of the answer matters: value +
// terminator, where -z/--null pick \0 and the default is \n (the two flags
// are independent, unlike --null elsewhere). Reads come from the shim-local
// config store, like every other config path; --local is accepted and
// implied. Real git resolves the rare ~user/… form against the passwd
// database, which the injected Ctx cannot reach hermetically — those take
// git's own lookup-failed fatal instead.
// The fixture harness has no env seam, so the ~-expanding fixtures compute
// their expected stdout from os.homedir() in-process — the same call the
// path itself makes, keeping the pin exact under both `bun test` and the
// compiled binary's selftest replay.
import { homedir } from "node:os"
import { configKey, definePath, fail, ok } from "../core"

const home = homedir()

export default definePath({
	name: "config-path-get-null",
	summary: "config --path reads with tilde expansion, \0 or newline terminator",
	spec: "config --local? (-z|--null)? --path (--get|--get-all)? <key>",

	async run(args, ctx) {
		const v = ctx.config.get(configKey(args.pos.key!))
		if (v === undefined) return fail(1, "")
		let out = v
		if (out.startsWith("~")) {
			if (out !== "~" && !out.startsWith("~/"))
				return fail(128, `fatal: failed to expand user dir in: '${out}'\n`)
			out = out === "~" ? home : home + out.slice(1)
		}
		return ok(`${out}${args.flags.has("-z") || args.flags.has("--null") ? "\0" : "\n"}`)
	},

	fixtures: [
		{
			name: "-z --path --get expands ~ to home",
			argv: ["config", "-z", "--path", "--get", "core.excludesfile"],
			config: { "core.excludesfile": "~/conf/excludes.txt" },
			arcReplies: {},
			want: { stdout: `${home}/conf/excludes.txt\0`, code: 0 },
		},
		{
			name: "--path without -z newline-terminates",
			argv: ["config", "--path", "--get", "core.excludesfile"],
			config: { "core.excludesfile": "conf/excludes.txt" },
			arcReplies: {},
			want: { stdout: "conf/excludes.txt\n", code: 0 },
		},
		{
			name: "--get-all with --path after the read flag",
			argv: ["config", "--get-all", "--path", "core.excludesfile"],
			config: { "core.excludesfile": "conf/excludes.txt" },
			arcReplies: {},
			want: { stdout: "conf/excludes.txt\n", code: 0 },
		},
		{
			name: "bare ~ expands to home itself",
			argv: ["config", "-z", "--path", "--get", "core.excludesfile"],
			config: { "core.excludesfile": "~" },
			arcReplies: {},
			want: { stdout: `${home}\0`, code: 0 },
		},
		{
			name: "~user form hits git's passwd-lookup fatal",
			argv: ["config", "-z", "--path", "--get", "core.excludesfile"],
			config: { "core.excludesfile": "~otheruser/conf/excludes.txt" },
			arcReplies: {},
			want: {
				stdout: "",
				stderr: "fatal: failed to expand user dir in: '~otheruser/conf/excludes.txt'\n",
				code: 128,
			},
		},
		{
			name: "missing key exits 1 silently",
			argv: ["config", "-z", "--path", "--get", "no.such.key"],
			arcReplies: {},
			want: { stdout: "", stderr: "", code: 1 },
		},
		{
			name: "empty value prints bare terminator",
			argv: ["config", "-z", "--path", "--get", "core.excludesfile"],
			config: { "core.excludesfile": "" },
			arcReplies: {},
			want: { stdout: "\0", code: 0 },
		},
		{
			name: "implicit read without --get",
			argv: ["config", "--path", "core.excludesfile"],
			config: { "core.excludesfile": "conf/excludes.txt" },
			arcReplies: {},
			want: { stdout: "conf/excludes.txt\n", code: 0 },
		},
	],
})
