<div align="center">

# Superior

A minimal desktop core. Open a local or SSH-backed project folder and run agent CLIs (`claude`, `codex`) inside it, with live output in an embedded, tabbed terminal.

[![Download](https://img.shields.io/github/v/release/Engazan/superior?label=Download&style=for-the-badge&logo=github)](https://github.com/Engazan/superior/releases)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](#license)
![Platforms](https://img.shields.io/badge/Platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge)

### ⬇️ [**Download the latest release**](https://github.com/Engazan/superior/releases)

![Superior application preview](docs/app-preview.png)

</div>

## Install

### macOS

Release builds are **signed with a Developer ID and notarized by Apple**, so they open
with a normal double-click — no Gatekeeper warning.

If you ever hit *"Superior is damaged and can't be opened"* (only happens with an older,
unsigned build, or a download that kept its quarantine flag), strip the flag once from a
terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Superior.app
```

### Windows

The Windows build is unsigned, so SmartScreen may warn on first run — choose
**More info → Run anyway**.

## Stack

Electron + React + TypeScript + Vite (`electron-vite`) + Tailwind CSS, with `node-pty`
for true-TTY process execution and `@xterm/xterm` for terminal rendering.

## Scripts

```bash
npm install      # installs dependencies (Node 22.12+)
npm run dev      # launch the app in development (HMR)
npm run build    # type-check + build main/preload/renderer into out/
npm start        # preview the production build
npm run rebuild  # manually rebuild node-pty if Electron is upgraded

npm run dist:mac    # package a macOS dmg/zip
npm run dist:win    # package a Windows nsis installer/zip
npm run dist:linux  # package a Linux AppImage/deb
```

Builds run per-platform on their native OS (CI uses a macOS/Windows/Linux matrix —
see `.github/workflows/ci.yml` and `release.yml`). `node-pty` is a native module, so packaging on
Windows needs the VS Build Tools + Python and Linux needs `build-essential` + `python3`.

## How it works

- **Open from folder** → native directory picker (main process). The chosen path is
  validated and persisted to `workspaces.json` under the app's `userData` dir, then
  restored on next launch.
- **Remote SSH workspace** → stores an SSH host/alias plus remote path and launches
  terminals through the system `ssh` client in that directory. Credentials, keys
  and passphrases stay owned by your normal SSH config/agent.
- **Open Claude / Open Codex** → spawns the CLI through the host shell with `cwd`
  set to the workspace. On macOS/Linux that's a *login shell* (`$SHELL -l -c <cmd>`,
  falling back to `/bin/bash`) so your real `PATH` (e.g. `~/.local/bin`, nvm) is
  available even when launched from Finder; on Windows it's `cmd.exe /c <cmd>`
  (and a plain terminal opens PowerShell).
- Each launched agent gets its own terminal pane; Claude, Codex and custom
  presets can run side by side on the same workspace surface, without new tabs.

### Splitting and moving terminals

- Click **SPLIT** in a terminal's top-right corner, choose a preset from the
  same picker as **+**, then choose left, right, above or below.
- Drag a terminal by its header onto another terminal. The nearest edge selects
  its placement, and the highlighted area previews the resulting position.
  This moves the existing terminal; it does not merge shell input or restart it.
- Drag a divider to resize its split. Hold Alt to bypass snapping. Escape,
  pointer cancellation or losing window focus cancels an in-progress drag.
- Closing a pane gives its space back to its sibling. Layouts are saved per
  workspace, and restarting a terminal retains its position. Existing grid
  layouts migrate with their cell sizes intact. The existing 12-pane limit,
  maximize/restore and broadcast features remain available.

### Code and terminals

Use **Terminals | Code** in the center of the title bar, or **Cmd/Ctrl+Shift+E**, to
switch between the terminal layout and the file editor. The shortcut is
customizable in Settings → Keyboard.

Opening a file from the project tree, file search, or a terminal link selects
**Code**. Each file gets a tab; reopening the same file selects its existing tab.
Use the split button or drag a tab into the right half of the editor to view two
files side by side. Drag the divider to resize, or use its arrow keys while
focused. The merge button brings the groups back together.

Terminals continue running while Code is visible. Open editors retain unsaved
changes, undo history, cursor and scroll when switching files, projects, views,
or settings. **Cmd/Ctrl+S** saves the focused editor; **Cmd/Ctrl+W** closes its tab
and asks before discarding unsaved edits. Each workspace remembers its open file
paths, editor groups, divider width and selected view across app restarts.

### Terminal activity and notifications

The activity pulse means the terminal is producing output; a pause does not mean
the agent has finished. Attention indicators and background OS notifications are
triggered by explicit terminal alerts (BEL, OSC 9 notifications, or OSC 777
`notify`) or an actual process exit. Alerts can also mean an agent needs approval,
so the UI says **needs attention**, not **finished successfully**.

Repeated alerts are coalesced until another keyboard interaction or submitted
prompt. Historical scrollback, redraws, Windows OSC 9;4 progress updates and daemon
disconnects do not trigger completion notifications. Native notifications are
suppressed while Superior is focused or notifications are disabled in settings.

An interactive CLI must emit a supported terminal alert to notify between turns;
if its own notifications are disabled or use an unsupported channel, Superior
does not guess completion from silence. No agent configuration files are changed.

### Review comments → agent

In **Changes**, click **+** beside a diff line to add a review comment. Save with
**Ctrl/Cmd+Enter** or **Save**. The comments list lets you edit or remove notes,
then **Send to agent** shows the combined prompt and a picker of running command
sessions in the current workspace. Sending pastes the batch and presses Enter;
choose an agent ready for input.

Notes are saved locally per workspace and retain their original file, old/new
line, branch, staged/unstaged side, and nearby code. They survive panel switches,
app restarts, staging, and subsequent file edits. The original excerpt remains
available even when its line is no longer in the diff. Notes stay in the list
after sending so you can check the agent's revision and remove addressed items.
A transport error keeps the notes; check the target terminal before retrying.

### Browser preview and Design Mode

Use the **Terminals · Code · Browser** switch in the title bar to open Browser.
Enter the HTTP/HTTPS URL of your running development server. Back, Forward and
Reload work within that workspace; its last URL is restored on the next app
launch. The workspace-mode shortcut cycles through all three modes. With focus
in the page, **Ctrl/Cmd+L** focuses the address bar and app navigation shortcuts
remain available.

Turn on **Design Mode** and click an element. The click selects it without
activating its page action. A dialog shows the element's visible screenshot crop,
HTML and computed CSS. Describe the change, pick a running agent in the workspace,
and choose **Send to agent**. The request includes the source context and a local
PNG path that the agent can read. **Escape** leaves selection mode. The selected
element and draft remain available while switching modes during the app session.

Preview pages run in a separate sandboxed Chromium view without Superior's API or
Node access. Browser views hide while app dialogs are open and close with their
workspace/window. The development server still runs independently; remote agent
sessions cannot receive the local screenshot through this flow.

## Account usage footer

Codex profiles also display available reset tickets and their expiry dates when
the provider supplies them. **Use one ticket** opens a confirmation dialog showing
the selected profile; only **CONFIRM** submits the reset. The provider selects the
ticket. Limits and ticket availability are fetched again afterwards, including for
custom memory profiles. Failed ticket lookups are shown as unknown, not zero.
Ambiguous network results can be retried with the same request ID during the
current app session; reset requests are never retried automatically.

The footer shows Claude and Codex subscription limits. Open **Profiles & options**
to pin default or custom-memory profiles, inspect each limit and reset time,
refresh usage, and choose used/remaining percentages or compact details. Choices
are saved. Custom profiles come from **Custom memory terminal presets**; selecting
them here chooses the displayed usage profile, not the account of a running CLI.

Each profile reads its own credentials: Claude's `.credentials.json` (or its
scoped macOS Keychain entry) and Codex's `auth.json`. Credentials stay in the main
process and are sent only to their provider's fixed account-usage endpoint.
The footer does not change login files or install status-line hooks. Codex profiles
using only an OS credential store currently show that no readable sign-in is
available. Expired credentials require signing in again through the relevant CLI.

Usage refreshes approximately once per minute, with caching and backoff for
rate-limited requests. Provider account endpoints are not stable public billing
APIs; failures display an unavailable state rather than zero usage. Profiles that
share an account also share its quota, so percentages are never summed.

## Source layout

```
src/shared/                  # domain types, typed IPC contract, daemon protocol
src/main/                    # Electron main process: services + IPC handlers
src/daemon/                  # persistent PTY process and scrollback buffer
src/preload/index.ts         # explicit contextBridge capabilities
src/renderer/src/            # React UI, hooks, terminal and file/git views
```

## License

MIT
