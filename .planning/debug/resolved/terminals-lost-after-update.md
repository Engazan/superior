---
status: resolved
trigger: "ked sa updatuje aplikacia tak updatovana aplikacia strati akoby aktivne terminali a vsetky musim zapnut odznova"
created: 2026-08-17
updated: 2026-08-17
---

# Debug Session: Terminals lost after update

## Symptoms

- Running terminal sessions should survive an application update and reconnect after relaunch.
- After installing an update, previously active terminals are no longer active and must be started again.
- Reproduction: keep terminals running, install an in-app update, and let Superior relaunch.
- No error message was reported.

## Current Focus

- hypothesis: The update path shuts down the terminal daemon on every OS even though only Windows NSIS needs its executable lock released.
- test: Gate update-time daemon shutdown to Windows and cover macOS, Linux, Windows, and idempotency with a regression test.
- expecting: macOS and Linux updates disconnect from the daemon normally so PTYs survive; Windows retains the existing installer-lock workaround.
- next_action: archive resolved session

## Evidence

- timestamp: 2026-08-17T21:00:00Z; `quitAndInstall()` unconditionally calls `releaseDaemonForUpdate()` before invoking electron-updater.
- timestamp: 2026-08-17T21:00:00Z; `releaseDaemonForUpdate()` sends `shutdown` to the daemon, whose handler kills every PTY and exits.
- timestamp: 2026-08-17T21:00:00Z; comments and commit 73849f9 identify a Windows NSIS executable lock as the sole reason for the forced daemon shutdown, but the implementation has no platform guard.
- timestamp: 2026-08-17T21:00:00Z; current electron-builder documentation states macOS Squirrel.Mac stages and applies updates on relaunch; the Windows NSIS installer is a separate platform path.

## Eliminated

- hypothesis: Renderer restoration alone loses still-running terminals.
  reason: the update shutdown protocol explicitly kills the PTYs before the renderer can restore them.

## Resolution

- root_cause: The Windows-only installer workaround was executed on every platform. Its daemon `shutdown` message deliberately kills all PTYs, so macOS/Linux updates destroyed the very terminal processes the daemon exists to preserve.
- fix: Restrict update-time daemon shutdown and pending-quit interception to Windows. macOS/Linux now follow the ordinary disconnect path, leaving the detached daemon and its PTYs alive for the updated app to restore.
- verification: `npm test` (31 files, 131 tests); `npm run typecheck`; `npm run lint`; `npm run build`; `npm run check:bundle`; all passed.
- files_changed: src/main/services/update.service.ts; src/main/services/update.service.test.ts
- prevention: why not caught: the original NSIS-lock fix tested daemon shutdown but not its platform scope; guard: the new lifecycle test stages an update on macOS, Linux, and Windows and verifies both pending-quit state and daemon shutdown behavior.
