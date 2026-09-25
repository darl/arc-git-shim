#!/usr/bin/env bash
# arc-remount-sweep: remount every arc mount point that arc still lists as
# unmounted and whose store is still on disk. Meant for arc-remount.service at
# boot, safe to run by hand. Pass -n to only print what would be mounted.
#
# Source of truth is `arc mount --list --json` (fields: status, mount, store,
# object-store, ...). A mount dir that is missing means the worktree was
# removed on purpose; a non-empty one means something wrote into the
# unmounted path (seen: ya make symlinks), which arc refuses anyway. Both are
# reported and skipped rather than forced.
set -u
dry=0
[ "${1:-}" = "-n" ] && dry=1
failed=0
while IFS=$'\t' read -r mnt store obj; do
	[ -n "$mnt" ] || continue
	if [ ! -d "$store" ]; then
		echo "skip $mnt: store gone ($store)"
	elif [ ! -d "$mnt" ]; then
		echo "skip $mnt: mount dir missing"
	elif [ -n "$(ls -A "$mnt" 2>/dev/null)" ]; then
		echo "skip $mnt: mount dir not empty"
	else
		args=(mount -m "$mnt" -S "$store")
		# A store that keeps its own objects reports them as its object-store;
		# only a shared one (outside the store) needs to be passed back in.
		case "$obj" in "" | "$store"/*) ;; *) args+=(--object-store "$obj") ;; esac
		if [ "$dry" = 1 ]; then
			echo "would run: arc ${args[*]}"
		elif out=$(arc "${args[@]}" 2>&1); then
			echo "mounted $mnt"
		else
			echo "FAILED $mnt: $(echo "$out" | tail -1)"
			failed=1
		fi
	fi
done < <(arc mount --list --json | jq -r '.[] | select(.status != "mounted") | [.mount, .store, (.["object-store"] // "")] | @tsv')
exit $failed
