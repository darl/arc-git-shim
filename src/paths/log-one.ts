// git log -1 [range] — git's DEFAULT log output (the "medium" pretty format):
//   commit <hash>
//   [Merge: <p1> <p2>          — only for merge commits]
//   Author: <name> <<email>>
//   Date:   <git-default date>
//
//       <message, every line indented 4 spaces; blank message lines
//        keep the 4-space indent — verified against real git output>
//
// Entries are separated by a blank line with NO trailing blank line after
// the last one (separator, not terminator) — though -n 1 yields at most a
// single entry anyway. All rendering goes through the gitlog engine
// (renderCommit/gitDate); only the medium-format framing lives here.
// The spec matches the literal "-1" only — other counts (-3) stay learnable.
import { arcJson, arcRevRange, definePath, isExecResult, ok, SHORT_HASH_LEN } from "../core"
import { gitDate, type LogEntry, renderCommit } from "../gitlog"

function renderEntry(e: LogEntry): string {
	const lines = [`commit ${e.commit}`]
	const parents = e.parents ?? []
	if (parents.length > 1) lines.push(`Merge: ${parents.map((p) => p.slice(0, SHORT_HASH_LEN)).join(" ")}`)
	lines.push(renderCommit("Author: %an <%ae>", e))
	lines.push(`Date:   ${gitDate(e.date)}`)
	// git indents every message line (blank ones included) with 4 spaces
	const msg = renderCommit("%B", e).replace(/\n+$/, "")
	const msgLines = msg === "" ? [] : msg.split("\n").map((l) => `    ${l}`)
	return [...lines, "", ...msgLines].join("\n") + "\n"
}

export default definePath({
	name: "log-one",
	summary: "single-commit log in git's default medium format",
	spec: "log -1 <range>?",

	async run(args, ctx) {
		const arcArgs = ["log", "--json", "-n", "1"]
		if (args.pos.range !== undefined) arcArgs.push(arcRevRange(args.pos.range))
		const entries = await arcJson<LogEntry[]>(ctx, arcArgs)
		if (isExecResult(entries)) return entries
		return ok(entries.map(renderEntry).join("\n"))
	},

	fixtures: [
		{
			name: "default medium format, subject + body paragraphs",
			argv: ["log", "-1"],
			arcReplies: {
				"log --json -n 1": {
					stdout: JSON.stringify([
						{
							commit: "a7819db772eed4b7b5a49b558b22f185464b80a0",
							author: "darl",
							date: "2026-06-30T23:53:19+03:00",
							message: "Add feature one\n\nBody line\n\nSecond paragraph",
						},
					]),
				},
			},
			want: {
				stdout:
					"commit a7819db772eed4b7b5a49b558b22f185464b80a0\n" +
					"Author: darl <darl@yandex-team.ru>\n" +
					"Date:   Tue Jun 30 23:53:19 2026 +0300\n" +
					"\n" +
					"    Add feature one\n" +
					"    \n" +
					"    Body line\n" +
					"    \n" +
					"    Second paragraph\n",
				code: 0,
			},
		},
		{
			name: "merge commit gets a Merge: line",
			argv: ["log", "-1"],
			arcReplies: {
				"log --json -n 1": {
					stdout: JSON.stringify([
						{
							commit: "b2c4d6e8f0a1b3c5d7e9f0a2b4c6d8e0f2a4b6c8",
							parents: [
								"11223344556677889900aabbccddeeff00112233",
								"4433221100ffeeddccbbaa998877665544332211",
							],
							author: "darl",
							date: "2026-09-24T22:06:55+03:00",
							message: "Merge feature branch",
						},
					]),
				},
			},
			want: {
				stdout:
					"commit b2c4d6e8f0a1b3c5d7e9f0a2b4c6d8e0f2a4b6c8\n" +
					"Merge: 112233445566 4433221100ff\n" +
					"Author: darl <darl@yandex-team.ru>\n" +
					"Date:   Thu Sep 24 22:06:55 2026 +0300\n" +
					"\n" +
					"    Merge feature branch\n",
				code: 0,
			},
		},
		{
			name: "range with no commits — empty output",
			argv: ["log", "-1", "trunk..HEAD"],
			arcReplies: { "log --json -n 1 trunk..HEAD": { stdout: "[]" } },
			want: { stdout: "", code: 0 },
		},
	],
})
