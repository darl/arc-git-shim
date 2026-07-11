# arc-git

A binary named `git` that impersonates git inside [Arcadia](https://a.yandex-team.ru) arc mounts:
it translates git commands to `arc`, emulates git's output formats (porcelain included), and
execs the real git transparently outside arc trees. An experiment in **self-improving binaries** —
unknown commands will block while an in-process pi agent writes a new translation path, tests
gate a rebuild, and the binary atomically replaces itself (learning loop: next ticket).

## Layout

- `src/core.ts` — spec grammar ("match = parse", strict), dispatcher, shared helpers
- `src/paths/*.ts` — one file per translation path: `spec` + `run` + embedded fixtures
- `src/paths-index.ts` — GENERATED registry (`bun run gen`); static imports for `bun build --compile`
- `src/main.ts` — entry: tree detection, real-git exec, builtins, dispatch
- `scripts/gen.ts` — codegen + collision gate (fixtures double as dispatch probes)
- `scripts/install.ts` — gen → typecheck → test → compile → compiled selftest → atomic swap

## Commands

```sh
bun run gen           # regenerate registry + collision gate
bun run check         # typecheck
bun test              # grammar tests + every path fixture
bun run build         # all of the above + compile to dist/git
bun run install-shim  # full gate, then atomic install to ~/.arc-git/bin/git
```

Builtins on the installed binary: `git arc-shim selftest | rollback | paths | version`.
Kill-switch: `ARC_GIT=off git …` always execs real git.

## Tracker

Work is organized in `tracker/` (wayfinder map + tickets).
