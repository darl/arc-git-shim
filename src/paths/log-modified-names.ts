// Arc's JSON name-status records supply the file statuses; git suppresses
// merge diffs by default and separates nonempty commit records with a blank line.
import { arcJson, definePath, isExecResult, ok } from "../core"

type Entry = { parents?: string[]; names?: { status: string; path: string }[] }

// Git's default core.quotePath quotes control characters and non-ASCII bytes.
function quotePath(path: string): string {
 const bytes = new TextEncoder().encode(path)
 if (![...bytes].some((b) => b < 32 || b >= 127 || b === 34 || b === 92)) return path
 const escapes: Record<number, string> = { 7: "\\a", 8: "\\b", 9: "\\t", 10: "\\n", 11: "\\v", 12: "\\f", 13: "\\r", 34: '\\"', 92: "\\\\" }
 return '"' + [...bytes].map((b) => escapes[b] ?? (b < 32 || b >= 127 ? `\\${b.toString(8).padStart(3, "0")}` : String.fromCharCode(b))).join("") + '"'
}

export default definePath({
 name: "log-modified-names",
 summary: "modified file names in recent history",
 spec: "log -n=<num> --pretty=<fmt> --name-only --diff-filter=<filter>",
 refine: (args) => args.pos.num === "1000" && args.pos.fmt === "format:" && args.pos.filter === "M",
 async run(_args, ctx) {
  const entries = await arcJson<Entry[]>(ctx, ["log", "--json", "--name-status", "-n", "1000"])
  if (isExecResult(entries)) return entries
  const groups = entries.filter((e) => (e.parents?.length ?? 0) < 2)
   .map((e) => (e.names ?? []).filter((n) => n.status === "modified").map((n) => quotePath(n.path)).join("\n"))
   .filter((s) => s !== "")
  return ok(groups.length ? groups.join("\n\n") + "\n" : "")
 },
 fixtures: [
  {
   name: "modified names grouped by commit, ignoring additions and merges",
   argv: ["log", "-n", "1000", "--pretty=format:", "--name-only", "--diff-filter=M"],
   arcReplies: { "log --json --name-status -n 1000": { stdout: JSON.stringify([
    { parents: ["a"], names: [{ status: "modified", path: "dir/one.txt" }, { status: "new file", path: "dir/new.txt" }, { status: "modified", path: "dir/tab\t.txt" }] },
    { parents: ["a", "b"], names: [{ status: "modified", path: "dir/merge.txt" }] },
    { parents: ["b"], names: [{ status: "modified", path: "dir/two.txt" }] },
   ]) } },
   want: { stdout: 'dir/one.txt\n"dir/tab\\t.txt"\n\ndir/two.txt\n', code: 0 },
  },
  {
   name: "arc failure is propagated",
   argv: ["log", "-n", "1000", "--pretty=format:", "--name-only", "--diff-filter=M"],
   arcReplies: { "log --json --name-status -n 1000": { code: 1, stderr: "arc failed\n" } },
   want: { stdout: "", stderr: "arc failed\n", code: 1 },
  },
 ],
})
