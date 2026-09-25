import { describe, expect, test } from "bun:test"
import { mountLauncher, mountPathOf, mountUnitName, systemdCgroupPath, systemdRunArgv } from "../src/mount-launch"

const v1InService = [
	"12:pids:/system.slice/t3code.service",
	"4:memory:/system.slice/t3code.service",
	"1:name=systemd:/system.slice/t3code.service",
	"0::/system.slice/t3code.service",
].join("\n")
const v1InSession = ["4:memory:/user.slice/user-24041.slice/session-9590.scope", "1:name=systemd:/user.slice/user-24041.slice/session-9590.scope"].join("\n")
const v2InService = "0::/system.slice/t3code.service\n"
const v2InUserUnit = "0::/user.slice/user-1000.slice/user@1000.service/app.slice/arc-remount.service\n"

const base = { platform: "linux", env: {}, uid: 24041, haveSystemdRun: true }

describe("systemdCgroupPath", () => {
	test("prefers the name=systemd line on cgroup v1", () => {
		expect(systemdCgroupPath(v1InService)).toBe("/system.slice/t3code.service")
		expect(systemdCgroupPath(v1InSession)).toBe("/user.slice/user-24041.slice/session-9590.scope")
	})
	test("reads the unified line on cgroup v2", () => {
		expect(systemdCgroupPath(v2InUserUnit)).toBe("/user.slice/user-1000.slice/user@1000.service/app.slice/arc-remount.service")
	})
	test("no systemd hierarchy", () => {
		expect(systemdCgroupPath("4:memory:/docker/abc\n")).toBeNull()
		expect(systemdCgroupPath("")).toBeNull()
	})
})

describe("mountLauncher", () => {
	test("inside a system service: escape to the user manager", () => {
		expect(mountLauncher({ ...base, cgroup: v1InService })).toEqual({ kind: "systemd-user", runtimeDir: "/run/user/24041" })
		expect(mountLauncher({ ...base, cgroup: v2InService })).toEqual({ kind: "systemd-user", runtimeDir: "/run/user/24041" })
	})
	test("already in the user slice: spawn directly", () => {
		expect(mountLauncher({ ...base, cgroup: v1InSession })).toEqual({ kind: "direct" })
		expect(mountLauncher({ ...base, cgroup: v2InUserUnit })).toEqual({ kind: "direct" })
	})
	test("keeps an explicit XDG_RUNTIME_DIR", () => {
		expect(mountLauncher({ ...base, cgroup: v2InService, env: { XDG_RUNTIME_DIR: "/run/user/7" } })).toEqual({
			kind: "systemd-user",
			runtimeDir: "/run/user/7",
		})
	})
	test("no systemd, not linux, or no systemd-run: direct", () => {
		expect(mountLauncher({ ...base, cgroup: "4:memory:/docker/abc\n" })).toEqual({ kind: "direct" })
		expect(mountLauncher({ ...base, cgroup: v2InService, platform: "darwin" })).toEqual({ kind: "direct" })
		expect(mountLauncher({ ...base, cgroup: v2InService, haveSystemdRun: false })).toEqual({ kind: "direct" })
		expect(mountLauncher({ ...base, cgroup: "0::/\n" })).toEqual({ kind: "direct" })
	})
	test("ARC_GIT_MOUNT_UNIT overrides both ways", () => {
		expect(mountLauncher({ ...base, cgroup: v2InService, env: { ARC_GIT_MOUNT_UNIT: "0" } })).toEqual({ kind: "direct" })
		expect(mountLauncher({ ...base, cgroup: v1InSession, env: { ARC_GIT_MOUNT_UNIT: "1" } })).toEqual({
			kind: "systemd-user",
			runtimeDir: "/run/user/24041",
		})
	})
})

describe("mount argv helpers", () => {
	test("mount path from both argv shapes", () => {
		expect(mountPathOf(["mount", "/wt/a"])).toBe("/wt/a")
		expect(mountPathOf(["mount", "-m", "/wt/b", "-S", "/s/b", "--object-store", "/o"])).toBe("/wt/b")
		expect(mountPathOf(["mount"])).toBeNull()
	})
	test("unit name is systemd-safe and unique per shim process", () => {
		expect(mountUnitName("/home/u/.t3/worktrees/arcadia/t3code-1cdcc414", 42)).toBe("arc-mount-t3code-1cdcc414-42")
		expect(mountUnitName("/wt/ünï cödé@x", 7)).toBe("arc-mount--n--c-d-@x-7".replace("@", "-"))
		expect(mountUnitName(null, 1)).toBe("arc-mount-mount-1")
	})
	test("systemd-run argv", () => {
		expect(systemdRunArgv(["mount", "/wt/a"], "arc-mount-a-1")).toEqual([
			"systemd-run",
			"--user",
			"--quiet",
			"--collect",
			"--property=Type=forking",
			"--unit=arc-mount-a-1",
			"--",
			"arc",
			"mount",
			"/wt/a",
		])
	})
})
