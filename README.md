# arc-git

A binary named `git` that impersonates git inside [Yandex Arcadia](https://a.yandex-team.ru) (`arc`) working copies: it translates git commands to arc commands and emulates git's output formats byte-for-byte where parsers care (porcelain, plumbing). Outside an arc tree it is a transparent alias for the real git — safe to keep first on PATH everywhere.

It is also an experiment in **self-improving binaries**: when a git invocation matches no known translation, the shim blocks, spawns an LLM episode (pi) that writes exactly one new translation path + fixtures, runs the full build gate (codegen → typecheck → tests → compile → compiled-binary selftest), atomically replaces its own binary, auto-commits the learned path, and then answers the original invocation. Second run: ~20 ms.

Primary callers are AI agents (Claude Code, orca) — output fidelity for parsers beats prettiness.

## How it works

- One translation path = one file in `src/paths/` declaring a strict git-synopsis spec (`definePath`). Match = parse: undeclared argv shapes never match, they fall through to learning.
- Tests are embedded fixtures with canned arc replies; the compiled binary self-tests them (`git --arc-git-selftest`).
- Real git subcommand names are gated: `git br` resolves your git aliases first, then fails with git's own "not a git command" — partial tokens from shell completion can never trigger learning.

## Install (fresh machine)

Prerequisites:

- [bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- real `git` somewhere on PATH (the shim execs it outside arc trees)
- `arc` CLI with a mounted arcadia working copy (Linux: FUSE required)
- for the learning loop only: pi model credentials (see below) and network access to the model endpoint

Build and install:

```sh
git clone <this-repo> ~/projects/arc-git
cd ~/projects/arc-git
bun install
bun run install-shim     # gate → compile → self-test → install to ~/.arc-git/bin/git
```

The installer never edits shell config. Put `~/.arc-git/bin` FIRST on PATH yourself:

```fish
# fish (persists via universal variable; enough for GUI apps that hydrate
# PATH from the login shell, e.g. orca)
fish_add_path --move ~/.arc-git/bin
```

```sh
# bash/zsh — add to BOTH files:
#   ~/.profile  (login shells — this is what orca's SSH relay sees)
#   ~/.bashrc / ~/.zshrc  (interactive shells, agent PTYs)
export PATH="$HOME/.arc-git/bin:$PATH"
```

Verify:

```sh
which git                          # → ~/.arc-git/bin/git
git --version                      # passthrough to real git
git -C <arcadia-root> status -sb   # translated by the shim
git arc-shim version
```

### pi credentials (learning loop)

The learner reads models from `~/.pi/agent/models.json` (provider entry with the internal endpoint + token — copy it from a configured machine over a secure channel; never commit it). Pick the default model once by adding to `~/.arc-git/config.json`:

```json
"defaultModel": "<provider>/<model>"
```

Without credentials the shim still works fully — unknown commands fail honestly instead of learning (`no translation for '…'`), and a 1-hour negative cache prevents repeated attempts.

### Worktrees with a shared object store (recommended)

By default each `git worktree add` = `arc mount` with an isolated store (~10 GB each). Enable the shared-store mode (the `ai/tools/arc_worktree` mount-shared pattern) once per arc root:

```sh
cd <arcadia-root>
git config arcgit.storesbase  ~/.arc/stores           # small private store per mount
git config arcgit.objectstore ~/.arc/arc-git-objects  # ONE object store for all mounts
```

The shared object store is standalone (owned by no mount) and survives every `git worktree remove`.

### Shell completion (fish)

fish's git completions invoke `git` themselves; unknown shapes must not block your shell on a learn episode. Install the wrapper (loads the stock completions, runs them under `ARC_GIT=static`):

```fish
ln -sf ~/projects/arc-git/shell/fish/git.fish ~/.config/fish/completions/git.fish
```

bash/zsh completion in arc trees is an unexamined gap: their git completions also invoke `git`. The subcommand gate stops the worst of it (partial tokens), but exotic completion probes on real subcommands could still trigger a learn. If it bites, `export ARC_GIT=static` in the completion context, or live without git completion inside arcadia.

## Controls

| control | effect |
|---|---|
| `ARC_GIT=off git …` | bypass the shim entirely (pure real-git alias) |
| `ARC_GIT=static git …` | translate known paths; unknown shapes fail instantly, never learn |
| `git --no-pager …` / `-P` | suppress the pager (honored like real git) |
| `git arc-shim selftest` | run all embedded fixtures in the installed binary |
| `git arc-shim paths` | list installed translation paths + specs |
| `git arc-shim rollback` | restore the previous binary (`git.prev`) |
| `git arc-shim learn [--model p/m] -- <args>` | hand-run a learn episode (review mode, no auto-commit) |

State lives in `~/.arc-git/`: the binary (`bin/`), per-root config store (`store/`), learn logs (`logs/`), negative cache (`state.json`), source pointer (`config.json`). First unknown command in an arc tree = a synchronous learn episode (≤5 repairs, ≤8 min, phase lines on stderr); green episodes auto-commit `learn: <spec>` to the source repo recorded in `config.json`.

## Orca

**Local (macOS app):** `fish_add_path --move ~/.arc-git/bin` is sufficient — orca hydrates PATH by spawning your login shell at startup and prepends its entries. Restart orca after flipping. Then: leave `ORCA_ARC_VCS` unset, and add the arcadia root as a repo **explicitly** (folder scan looks for `.git` and will never discover it).

> **Landmine:** orca appends `.orca` to the repo root `.gitignore` when missing. Arcadia's root `.gitignore` is a *tracked* file — orca will dirty the monorepo working copy on first touch. Decide how to handle this before pointing orca at the mount.

**SSH hosts (Linux VPS):** orca uploads a relay (`~/.orca-remote/relay-*/relay.js`) that executes all git commands remotely via bare `git` spawns. The relay is launched with plain `/bin/sh -c` over the ssh exec channel, so its PATH is the **raw sshd default** (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:…`) — no `~/.profile`, no rc files, and orca only *appends* fallback dirs (`~/.local/bin` etc.) after `/usr/bin`, so nothing user-level can outrank the real git. The reliable hook is `/usr/local/bin`, which precedes `/usr/bin` in that default:

```sh
sudo ln -s "$HOME/.arc-git/bin/git" /usr/local/bin/git
pkill -f relay.js     # restart the relay; orca respawns it on reconnect
```

Safe system-wide by design (the shim is a transparent real-git alias outside arc trees) and survives self-updates (the symlink targets the path; learns swap the binary atomically in place). Still add the shim dir to `~/.profile`/`~/.bashrc` for interactive sessions and agent PTYs. Verify:

```sh
ssh <host> 'env PATH=/usr/local/bin:/usr/bin:/bin which git'   # → /usr/local/bin/git
```

## Development

- `src/core.ts` — spec grammar ("match = parse", strict), dispatcher, shared helpers
- `src/paths/*.ts` — one file per translation path: `spec` + `run` + embedded fixtures
- `src/paths-index.ts` — GENERATED registry (`bun run gen`); static imports for `bun build --compile`
- `src/main.ts` — entry: builtins, alias resolution, tree detection, dispatch, pager
- `src/learner.ts` / `src/learning.ts` — the pi learning loop; `src/build.ts` — shared gate + atomic swap
- `scripts/gen.ts` — codegen + collision gate (fixtures double as dispatch probes)

```sh
bun run gen           # regenerate registry + collision gate
bun run check         # typecheck
bun test              # grammar tests + every path fixture
bun run build         # all of the above + compile to dist/git
bun run install-shim  # full gate, then atomic install to ~/.arc-git/bin/git
```

Work is organized in `tracker/` (wayfinder map + tickets).

## Uninstall

Remove `~/.arc-git/bin` from PATH, delete `~/.arc-git/`, delete the fish completion symlink. Nothing else is touched.
