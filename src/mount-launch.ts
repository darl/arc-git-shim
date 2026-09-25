// Where `arc mount` gets spawned from. Pure decisions only; ctx.ts does the I/O.
//
// A FUSE mount is a long-lived process that must outlive the shim call that
// started it. When the shim runs as a child of a system service (t3code.service
// runs `git worktree add`), a directly spawned `arc mount` inherits that
// service's cgroup and dies with it: every service restart and every cgroup
// OOM unmounts the worktree (incident 2026-09-25: one deploy unmounted 22
// worktrees, t3code then offered to `git init` them). Mounts made by hand or
// at boot live in the user slice and survive all of that.
//
// systemd-run --user asks the user's own systemd instance to start the mount
// as a transient service. The user manager forks it, so it lands in the user
// slice in every cgroup hierarchy. Type=forking matches arc's behavior: the
// parent exits once the mount is up, which is also when systemd-run returns.

export type MountLauncher = { kind: "direct" } | { kind: "systemd-user"; runtimeDir: string }

export interface MountLaunchInput {
	/** Contents of /proc/self/cgroup, or "" when unreadable. */
	cgroup: string
	platform: string
	env: Record<string, string | undefined>
	uid: number
	/** Whether systemd-run is on PATH. */
	haveSystemdRun: boolean
}

/** The cgroup path systemd manages this process under: the `name=systemd`
 * hierarchy on cgroup v1, the unified `0::` line on v2. */
export function systemdCgroupPath(cgroup: string): string | null {
	for (const line of cgroup.split("\n")) {
		const m = /^\d+:(?:name=systemd)?:(.*)$/.exec(line.trim())
		if (m && (line.startsWith("0::") || line.includes("name=systemd"))) return m[1]!
	}
	return null
}

export function mountLauncher(input: MountLaunchInput): MountLauncher {
	const runtimeDir = input.env.XDG_RUNTIME_DIR || `/run/user/${input.uid}`
	const override = input.env.ARC_GIT_MOUNT_UNIT
	if (override === "0" || override === "off") return { kind: "direct" }
	if (override === "1" || override === "on") return { kind: "systemd-user", runtimeDir }
	if (input.platform !== "linux" || !input.haveSystemdRun) return { kind: "direct" }
	const path = systemdCgroupPath(input.cgroup)
	// Already in the user slice (interactive shell, user service): nothing to
	// escape from. No systemd cgroup at all (containers, odd setups): stay put.
	if (path === null || path === "/" || path.includes("/user.slice/")) return { kind: "direct" }
	return { kind: "systemd-user", runtimeDir }
}

/** Mount path from arc's argv: `mount <path>` or `mount -m <path> ...`. */
export function mountPathOf(arcArgs: string[]): string | null {
	const i = arcArgs.indexOf("-m")
	if (i >= 0) return arcArgs[i + 1] ?? null
	return arcArgs.slice(1).find((a) => !a.startsWith("-")) ?? null
}

/** systemd unit names allow [A-Za-z0-9:_.\-]; everything else becomes "-". */
export function mountUnitName(mountPath: string | null, pid: number): string {
	const base = (mountPath ?? "mount").split("/").filter(Boolean).pop() ?? "mount"
	return `arc-mount-${base.replace(/[^A-Za-z0-9:_.-]/g, "-").slice(0, 64)}-${pid}`
}

/** The systemd-run argv that starts `arc <arcArgs>` as a user transient service. */
export function systemdRunArgv(arcArgs: string[], unit: string): string[] {
	return [
		"systemd-run",
		"--user",
		"--quiet",
		"--collect",
		"--property=Type=forking",
		`--unit=${unit}`,
		"--",
		"arc",
		...arcArgs,
	]
}
