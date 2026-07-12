# arc-git shim integration for fish tab-completion.
#
# Install (shadows fish's embedded git completions):
#     ln -sf ~/projects/arc-git/shell/fish/git.fish ~/.config/fish/completions/git.fish
# Undo: remove that symlink.
#
# Why: fish's git completions invoke `command git` through the __fish_git
# helper. With the arc-git shim on PATH, an unknown invocation shape (or a
# partial token like "br" from mid-word completion) would BLOCK the shell on
# a synchronous learn episode. ARC_GIT=static serves the known translations —
# completions keep working inside arcadia — but unknown shapes fail instantly
# instead of learning.
#
# Load the stock completions from the fish binary, then wrap the one helper.
# static during the source too: the stock file scans `git config` aliases at
# LOAD time, before any wrapper can exist.
set -lx ARC_GIT static
status get-file completions/git.fish | source

if functions -q __fish_git; and not functions -q __arc_stock_fish_git
    functions --copy __fish_git __arc_stock_fish_git
    function __fish_git
        set -lx ARC_GIT static
        __arc_stock_fish_git $argv
    end
end
