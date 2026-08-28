// git hash-object --stdin-paths reads file paths from stdin (one per line)
// and writes each file's git blob SHA-1 to stdout. This is object-database
// plumbing: the hash is sha1("blob <size>\0<content>"), and -w would write
// the blob into the git object store.
//
// Arc has no hash-object command and no loose object store, so the blob
// hashing and -w write have no arc equivalent. The shim's Ctx also exposes
// no stdin and no file-content reading, so even a pure-TS sha1 computation
// could not be fed. A codified fatal keeps the learner from burning episodes
// on an unlearnable shape. (Sibling: unsupported-read-tree, check-ignore-z-stdin.)
import { definePath, fail } from "../core"

const MSG =
	"fatal: 'hash-object --stdin-paths' is not supported in an arc repository (no git object database; stdin unavailable)\n"

export default definePath({
	name: "hash-object-stdin-paths",
	summary: "codified fatal: object-db blob hashing from stdin has no arc equivalent",
	spec: "hash-object --stdin-paths",

	async run() {
		return fail(128, MSG)
	},

	fixtures: [
		{
			name: "hash-object --stdin-paths fatals",
			argv: ["hash-object", "--stdin-paths"],
			arcReplies: {},
			want: { stdout: "", stderr: MSG, code: 128 },
		},
	],
})
