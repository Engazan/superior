# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.19.5] - 2026-08-10

### Added

- **Open terminal file links inside Superior.** A new `Superior` choice under
  “Open files with” sends validated Cmd/Ctrl-clicked paths to the built-in file
  preview and editor, using the same flow as opening a file from the Files panel.
- **Optional workspace tools in the sidebar.** Workspace search, favorites and
  recently visited shortcuts can now be enabled from Appearance settings and
  remain hidden by default for a calmer sidebar.

### Changed

- **A cohesive card-and-island interface.** The title bar, workspace sidebar,
  terminal grid, right panel and Settings now share rounded floating surfaces,
  consistent spacing and cleaner parent backgrounds. Settings navigation,
  controls, tables and lists are split into distinct island panels.
- **Refined light and dark themes.** The light palette is cleaner and less
  yellow, the dark palette has stronger depth and contrast, and terminal chrome,
  window controls and sidebar surfaces now fit both themes more consistently.

### Fixed

- **Maximized terminals are remembered per workspace tab.** Each tab can keep
  one independent maximized terminal, so maximizing in another workspace or tab
  no longer restores the previous one. Closing a tab cleans up only its state,
  while restarting a terminal preserves its maximized state.
- **Panel and terminal edge artifacts.** The right panel keeps its outer inset,
  terminal cells sit flush against the intended edge, and stray parent, lower
  panel and corner backgrounds no longer show through rounded terminal borders.
- **Profile and window chrome interactions.** Focused profile fields and the Add
  profile action no longer clip, profile accent changes apply immediately, and
  window controls and top-bar separators align with the redesigned chrome.

## [0.19.4] - 2026-08-06

### Added

- **Faster workspace navigation.** The sidebar now supports workspace search,
  favorites and recently visited workspaces, with clearer empty states and
  more discoverable project actions.
- **More helpful first-run and error states.** Opening a project now offers
  clearer local, Git and SSH entry points, while failed Git repository loading
  can be retried or redirected to integration settings.

### Changed

- **Clearer, calmer workspace sidebar.** Folder sections are visually grouped,
  workspace details are easier to scan, and secondary actions appear on hover
  instead of permanently competing with the project names.
- **More usable settings and panels.** Settings content has improved spacing,
  prompts and daemons can be filtered, the Files panel is the default right
  panel, and key controls now expose stronger keyboard and screen-reader
  semantics across the supported languages.
- **Improved macOS title bar spacing.** The sidebar toggle now has a clearer
  separation from the native window controls.

### Fixed

- **Queued Claude and Codex tasks now continue correctly.** Each queued prompt
  runs in one-shot mode and exits after completing, so the next task starts
  instead of remaining blocked behind an idle interactive process with an
  active Cancel action.

## [0.19.3] - 2026-07-20

### Fixed

- **The profile dropdown stays above terminal content.** The title bar now has
  an explicit stacking layer, so the centered profile menu is fully visible
  instead of being covered by terminals while remaining below global overlays.

## [0.19.2] - 2026-07-17

### Fixed

- **Windows updates no longer stall on "Superior cannot be closed."** The
  terminal daemon runs the app's own executable, so an instance left alive after
  the window closed kept a lock on the file the NSIS updater has to replace — the
  installer asked you to close the app manually and retry (which only worked once
  the daemon idled out). The app now shuts the daemon down before installing an
  update, on both the "restart to install" action and the install-on-quit path.
- **Terminal search no longer crashes the renderer on old scrollback.** Match
  decorations could make xterm dereference a missing marker and replace the
  whole window with the error boundary. Search now uses the safe selection-only
  path, contains stale-addon failures during terminal teardown, and routes find
  shortcuts to an open file preview unless the terminal has focus.
- **The profile switcher is truly centered.** Its position is pinned to the
  title bar's midpoint, so changing Git status, branch text, panel controls or
  window controls on either side can no longer shift it off center.

## [0.19.1] - 2026-07-12

### Fixed

- **Exited terminals no longer pile up across restarts.** A finished terminal —
  most often a `claude` that ended while the app was quit, so its exit went
  unheard — was persisted as a restartable "dead cell" and restored on every
  launch, accumulating beside the live terminal it was relaunched next to (one
  running Claude becoming three, two of them exited). A dead cell now survives
  exactly one launch to be restarted, then is pruned; live daemon sessions are
  unaffected.

## [0.19.0] - 2026-07-11

### Fixed

- **Terminals survive a daemon restart.** After a daemon crash or a dropped
  socket, mounted terminals silently stopped receiving output and hung on
  "running" until an app restart. The client now re-attaches to its sessions
  after reconnecting, sessions the new daemon no longer knows about become
  restartable cells instead of frozen ones, and a `list` request that times out
  during the outage no longer downgrades every live session — which previously
  spawned duplicate agents on restart.
- **Fast-failing commands always report their exit.** A command that died within
  milliseconds (a typo'd binary, a missing CLI) could exit before anything
  observed it, leaving the cell "running" forever and blocking that folder's task
  queue. The daemon now fans the exit out to every client, synthesizes one for a
  failed attach, and the task queue tracks in-flight state so it can still close
  the task.
- **Your profiles survive a corrupt store.** A corrupt `workspaces.json` was
  treated like a missing one and replaced with an empty state that then
  overwrote your profiles, folders and workspaces; it is now preserved as
  `.corrupt` and read through a validator that tolerates malformed entries.
- **Correct diffs for non-ASCII and spaced filenames.** Git's default path
  quoting made a diff of `á.txt` arrive with an empty path — breaking
  stage/unstage — and paths containing spaces or ` b/` were mis-split. Diffs now
  run with quoting disabled, decode C-quoted paths, and resolve the header
  ambiguity by preferring the split where both sides agree.
- **No half-switched working tree on slow git hooks.** Checkout, stash, commit
  and worktree operations shared a 5-second timeout that could `SIGTERM` them
  mid-operation under a slow pre-commit hook or a large tree; mutating git
  commands now get a 120-second budget, leaving the short timeout to read-only
  probes.
- **UI no longer stalls on shell probes.** Detecting shell command status ran a
  login shell synchronously inside an IPC handler, freezing the whole main
  process (and the UI) for up to five seconds under slow shell dotfiles; it now
  probes asynchronously. The usage tracker also stopped reading entire
  multi-megabyte transcripts synchronously on every poll.
- **Lighter persistence and polling.** Divider drags and terminal resizes no
  longer rewrite session and layout JSON on every pointer move (persisted once on
  release, resizes debounced), git-status polling is scoped to the active
  profile's folders instead of sweeping every repository ever added, and optional
  renderer features load lazily so the window paints sooner.
- **Windows daemon pipe isolation.** The daemon pipe name was derived from the
  first eight bytes of the userData path — effectively `C:\Users` on every
  machine — so all users and both dev and packaged installs collided on one pipe;
  it now hashes the full path with SHA-256.
- **Windows in-app updates.** The NSIS installer name now matches the filename
  in `latest.yml`, allowing the in-app updater to download and install Windows
  releases instead of requiring a manual download. The release workflow now
  verifies this before publishing.
- **Overlay, window and focus fixes.** Escape and global chords now respect the
  frontmost overlay (prompt picker, command palette, project and confirm modals)
  instead of reaching through it and closing the terminal behind; the show/hide
  hotkey and `superior <dir>` recover after the window is re-created on macOS;
  the auto-stash flag is reported when a checkout fails; and several IPC loads no
  longer spin forever on a rejected call.
- **Stability and resource sweep.** Bounded a set of unbounded buffers (terminal
  bus, usage store, transcript watchers, orphaned status files), stopped a
  malformed `presets.json` entry from breaking the whole list, surfaced clean
  error messages instead of Electron's raw invoke envelope, kept a valid repo
  from being mislabeled "not a repository", and localized the in-terminal exit
  notice.
- **Hardened boundaries and startup.** The renderer recovers from a transient
  startup failure through an error boundary and retry instead of a blank window,
  IPC payloads are validated at the boundary, a failed persistence write is no
  longer reported as success, and the daemon log is capped so it cannot grow
  without bound.

### Security

- **Integration tokens encrypted at rest.** Forge tokens were stored in plaintext
  in `integrations.json`; they now go through the OS keychain via Electron
  `safeStorage`, with a one-time migration and a plaintext fallback only where no
  keyring exists. Cloning was hardened alongside: the URL is scheme-checked and
  passed after `--`, the token is delivered through ephemeral git config instead
  of the argv-visible URL, the destination is kept inside the chosen parent
  directory, and the shell-open and read-only worktree handlers now enforce the
  same workspace-containment rule as every other entry point.

## [0.18.0] - 2026-07-09

### Added

- **Paste clipboard images into the terminal.** xterm's built-in paste is
  text-only, so a copied image never reached the agent. Paste is now intercepted
  in the capture phase, the bytes are saved to a temp file in the main process,
  and its path is inserted — so Claude/Codex can read the image just like a
  drag-and-dropped file.
- **Launch presets on remote SSH workspaces.** Terminal presets now run through
  the system `ssh` client in the remote directory, with the host/path and
  command inputs validated before launch.

### Fixed

- **Crash-safe settings and state.** Every JSON store (workspaces, tasks,
  presets, integrations, layouts, terminal sessions) now writes atomically via a
  temp file and rename, so an interrupted write can no longer truncate a file and
  silently reset your data to defaults. An unparseable file is preserved as
  `.corrupt` instead of being overwritten.
- **Lighter git status polling.** The working-tree summary no longer reads the
  contents of every untracked file on each poll — it still counts all files but
  reads only a bounded, parallelized sample — so a repository without a
  `.gitignore` (e.g. an untracked `node_modules`) no longer freezes the app.
- **Language switch keeps your terminals.** Changing the UI language no longer
  re-runs session restore, which previously dropped terminals that had exited
  during the session and reset the active cell.

### Security

- **Renderer navigation hardening.** The main window blocks top-frame navigation
  away from its own bundle, and external links open in the system browser only
  for `http(s)` URLs — untrusted repository content can no longer redirect the
  renderer or trigger arbitrary OS protocol handlers.

## [0.17.0] - 2026-07-08

### Added

- **Remote SSH workspaces.** Open Project now includes a Remote SSH source that
  stores an SSH host/alias plus remote path, can test the connection, and runs
  terminal presets through the system `ssh` client in that remote directory.
  Remote workspaces are marked in the sidebar and deliberately keep local-only
  file, git, task and worktree features disabled.

### Fixed

- **Terminal cells survive OS restarts.** Terminal sessions are persisted as
  restartable snapshots, so an app relaunch after the daemon is gone restores
  the terminal grid cells instead of dropping them.

## [0.16.0] - 2026-07-07

### Added

- **Open file paths from terminal output.** Cmd/Ctrl+click a path in any
  terminal to open it in your editor. A link provider scans terminal lines for
  path-like tokens (absolute, `~/`, cwd-relative, with optional `:line:col`),
  validates them against the opened workspace folders, and underlines only the
  paths that actually exist. The target editor is configurable — OS default,
  VS Code, Cursor, Zed (via URL schemes), or Sublime Text, PhpStorm, WebStorm
  (via their CLI) — and jumps to the exact line and column when present.
- **Editor picker with icons.** The editor dropdown in settings now shows a
  brand-colored monogram badge for each editor (VS, C, Z, S, PS, WS) and a
  monitor glyph for the OS default, so options are easy to scan. It is
  keyboard-navigable with Escape and outside-click dismissal.
- **Agent activity signals.** Per-session busy/attention dots appear on cells
  and the tab strip, dead terminals get a restart chip, and task failures raise
  a toast with retry support.

### Changed

- **UI/UX overhaul across shell, terminals, panels and settings.** The right
  panel is drag-resizable with persisted width and tab; the diff view gains
  two-column line numbers, auto-collapse for large diffs, stable expansion
  across staging, and stage-all-and-commit; history supports load-more and
  error states; terminal search shows a match counter with highlighted
  decorations; tasks support retry and reordering.
- **Shortcut changes.** Quick-launch default moved to `mod+t` (`ctrl+§` was
  ISO-only) and terminal cycling to `mod+alt+arrows`, with old defaults
  migrated automatically; Escape now exits settings; added shortcut-conflict
  detection and a focus-cell binding in Keyboard settings.
- **Consistency, accessibility and i18n.** Layered Escape handling via an
  overlay stack, modal focus trap, keyboard-accessible sidebar rows and a
  radiogroup segmented control, tone-aware error notes, and ~40 new i18n keys
  across all five locales.

### Fixed

- **Data-loss guards.** Closing running terminals/tabs and deleting a layout
  preset now ask for confirmation; the file preview warns on unsaved changes
  and checks the on-disk mtime before saving; global shortcuts no longer fire
  behind open overlays.
- **Quieter notifications.** The finished notification is debounced by 3s so
  mid-task pauses stop firing it, and SIGINT/SIGTERM exits no longer show as
  errors.

## [0.15.0] - 2026-07-04

### Added

- **Task queue.** A new **Tasks** tab in the right panel queues agent work per
  project: each task is a prompt plus a terminal preset, optionally launched in
  a freshly created branch workspace (git worktree) so parallel tasks never
  collide. Tasks run one at a time per project — the queued command is
  `<preset command> '<prompt>'`, and the next task starts automatically when
  the previous task's terminal exits (quit the CLI to advance, or use a
  headless preset like `claude -p` for a fully automatic queue). The queue can
  be paused, tasks canceled or removed, finished tasks report their exit code,
  and the whole queue persists across app restarts — tasks whose terminals
  survived in the daemon are picked up again on launch.
- **New "Light gradient" appearance theme.** A soft light gradient painted
  across the whole window with solid (non-transparent) dropdowns, available
  under Settings → Appearance. New users now default to this theme.

### Changed

- **Settings button moved to the sidebar.** The settings entry point now lives
  at the bottom of the sidebar instead of the top bar.

### Fixed

- **Opaque overlays on gradient themes.** Modals and overlays now stay fully
  opaque over the gradient themes instead of bleeding the background through.

## [0.14.0] - 2026-07-04

### Changed

- **Refreshed application icon.** New terminal-mark artwork with transparent
  rounded corners, applied across the macOS, Windows and Linux builds.

## [0.13.0] - 2026-07-04

### Added

- **New "Gradient" appearance theme.** A theme that paints the app-icon gradient
  (blue → violet → magenta → orange over near-black) across the whole window,
  with frosted-glass chrome floating on top. Unlike the macOS-only Transparent
  theme it is pure CSS, so it works on every platform. Pick it under
  Settings → Appearance.
- **App icon.** The macOS, Windows and Linux builds now ship with a proper
  application icon instead of the default Electron logo.

### Fixed

- **Theme choice persists across restarts.** Selecting the Gradient theme is now
  saved instead of silently reverting to the default on the next launch.

## [0.12.1] - 2026-07-02

### Changed

- **Much faster terminal output.** Terminal data from the daemon is now
  coalesced into a few large frames per tick and carried in a binary format
  instead of JSON, and a fast producer (e.g. `cat` of a huge file) is paused
  while the UI catches up — throughput is higher and memory stays flat under
  heavy output.
- **Snappier app under load.** Streaming terminal output no longer re-renders
  the whole window — only the sidebar activity indicators update, and terminals,
  the sidebar, and grid resizing are cheaper to redraw. Dragging grid dividers
  is smoother.
- **Lighter git polling.** Branch/diff badges are refreshed with far fewer git
  processes (one shared status call instead of several per panel), polling
  pauses while the window is hidden, and unchanged results no longer trigger
  UI updates.
- **Faster startup and settings.** The window appears without waiting for the
  worktree check, the CLI tools health check no longer freezes the app while
  probing login shells (it runs in the background and caches its result), and
  settings are kept in memory instead of re-read from disk.
- **Large markdown files open without stalling.** Syntax highlighting in the
  markdown preview is skipped for very large documents.

### Fixed

- **No stray branch tooltip over the open branch switcher.**

## [0.12.0] - 2026-07-01

### Added

- **Tabs hold their own terminal grid.** Each tab is now a container for an
  independent terminal grid, so you can keep a different arrangement of
  terminals per tab and switch between whole layouts within one workspace.

### Changed

- **Open or clone a project from one place.** The sidebar's separate "Open from
  folder" and "Clone project" buttons are replaced by a single **Open / Clone
  project** entry that opens a modal offering two sources — a local folder from
  this computer, or a repository from a connected git integration. The git
  browser is always visible; when no integration is configured it links straight
  to the settings to add one.
- **Themed hover tooltips.** Native OS `title` bubbles are replaced app-wide by a
  custom tooltip that matches the app theme, with a short open delay, smart
  above/below placement, an arrow, and viewport clamping so it never spills
  off-screen.
- **Grouped branch switcher.** The branch switcher now separates local and remote
  branches into their own sections.

## [0.11.0] - 2026-06-28

### Added

- **Edit files in the preview pane.** The right-sidebar file preview is now an
  editor for text and JSON files: an unsaved-changes dot next to the file name,
  a **Save** button, and a configurable Save shortcut (⌘/Ctrl+S by default).
  Very large (truncated) files stay read-only so a save can't drop the part that
  wasn't loaded.
- **Per-workspace git stats.** Each workspace row in the sidebar shows its
  uncommitted +/- line counts instead of the running-terminal count.
- **Restart an exited terminal in place.** When a preset command exits (e.g.
  Ctrl+C) the dead terminal can re-run its original command in the same slot —
  press Enter in it, or use the new restart button in the cell bar / tab strip.

### Changed

- **Full-width sidebar rows.** Folder and workspace hover highlights now span
  the full width of the sidebar.
- **Rename workspaces from a button.** A pencil button on each workspace row
  opens the inline rename (double-clicking the name still works).
- **Confirm before removing a workspace.** Removing a plain workspace now asks
  for confirmation, matching the prompt already shown for worktree-backed ones.

## [0.10.0] - 2026-06-26

### Added

- **Profile accent colors.** Each profile can carry its own color, set from the
  profile manager via a swatch popover next to the profile's delete button
  (presets, a custom picker, or none). The active profile's color tints the app
  title bar and the sidebar, so the profile you've switched to is recognizable
  at a glance.

### Changed

- **Terminal colors stay on the terminal.** A terminal preset's color now tints
  only that terminal's own topbar/tab instead of the whole app title bar,
  keeping the app chrome reserved for the active profile's color.

## [0.9.0] - 2026-06-24

### Added

- **Open a folder from the terminal.** Install a `superior` command (one click in
  **Settings → Command line**) and run `superior .` in any directory to open it in
  the app. If the app is already running, the folder opens in the current window
  instead of launching a second instance; otherwise it starts the app with that
  folder active. The installer writes the launcher and puts it on PATH without
  needing elevated permissions.

## [0.8.1] - 2026-06-23

### Fixed

- **Folders stop pulsing while still working.** A short pause in a terminal's
  output is no longer mistaken for the prompt finishing, so a folder no longer
  starts its attention pulse while its loader is still spinning. The pulse now
  fires only once the session has truly gone idle.

## [0.8.0] - 2026-06-23

### Added

- **Switch Git branches from the title bar.** Click the branch name to open a
  searchable dropdown of local branches and check one out. Switching never
  discards work: non-conflicting edits are carried over, while conflicting
  uncommitted changes are detected and offered a **Stash & switch** (recoverable
  later with `git stash pop`). Branches checked out in another worktree are
  listed but disabled. The search box also doubles as a name field — type a new
  name to **create a branch from the current one** and switch to it.
- **More keyboard shortcuts.** Open folder, previous/next workspace,
  previous/next profile, and manage profiles are now rebindable in
  **Settings → Keyboard**, so the app can be driven entirely from the keyboard.
- **CLI availability check.** Terminal presets show whether `claude` and `codex`
  are installed and runnable in the terminal this app launches. When a CLI is
  installed but invisible to the app's shell (its PATH lives only in an
  interactive rc file like `~/.zshrc`), a one-click fix adds it to the env file
  the app's shell actually reads.

### Changed

- **Steadier title bar.** The bar is now a fixed three-column layout, so the
  centered profile switcher no longer shifts when the left side changes width
  (Git status appearing/disappearing, branch name, switching profile/folder).

### Fixed

- **Profile keeps its active project.** Switching to another profile and back now
  restores the project you had focused instead of jumping to a different one.

## [0.7.0] - 2026-06-23

### Added

- **Profiles.** A new **PROFILE** switch in the center of the title bar opens a
  dropdown to pick a profile — each profile keeps its own separate set of
  projects (folders). A **Manage profiles…** entry opens a dialog to add,
  rename, and delete profiles. Deleting a profile removes its folders and their
  workspaces; the last remaining profile can't be deleted. Existing projects are
  migrated into a **Default** profile on first launch, and the selected profile
  is remembered across restarts. Localized in all five languages.
- **Remembered folder expand/collapse state.** Whether a project is rolled up or
  expanded in the sidebar is now saved, so each project reopens in the same state
  you left it in.

## [0.6.0] - 2026-06-22

### Added

- **Edit a project's appearance.** Right-click a project (folder) in the sidebar
  — or use the pencil button that appears on hover — to open an **Edit** dialog
  where you can upload a custom folder icon and set a display name. The project's
  path stays fixed; only its look changes. Localized in all five languages.
- **Diff stats next to the branch.** The title bar now shows the working-tree
  line counts beside the branch name — green `+added` and red `−removed` — when
  the folder is a Git repository and has uncommitted changes.

## [0.5.0] - 2026-06-21

### Added

- **In-app auto-update.** When a new version is available, the **Update** button
  now downloads the signed build in the background — showing a progress bar — and
  then offers **Restart & install** to apply it, instead of opening the GitHub
  release page. If a release has no update feed (or in dev), it falls back to
  opening the download page. Localized in all five languages.

  Note: auto-update activates for users running this version or newer; updating
  from an older build still opens the release page once.

## [0.4.0] - 2026-06-21

### Added

- **Reorder projects in the sidebar.** Drag a project (folder) header to move it
  up or down; a grab handle appears on hover and the new order is saved, so it
  persists across restarts. Workspaces within a project keep their order.

## [0.3.1] - 2026-06-21

### Fixed

- **macOS "damaged and can't be opened" error.** Release builds are now signed
  with a Developer ID and notarized by Apple, so they open with a normal
  double-click instead of being blocked by Gatekeeper. Unsigned builds also get
  an ad-hoc signature as a fallback so they can be opened via right-click → Open.
- **Terminal daemon timeout in packaged builds.** Restored the executable bit on
  node-pty's bundled `spawn-helper`, which npm strips from the tarball; without
  it the terminal failed with "Timed out waiting for the terminal daemon."

## [0.3.0] - 2026-06-21

### Added

- **Update notifications.** The app checks the project's GitHub releases on
  launch (and every few hours) and, when a newer version is published, shows a
  banner with an **Update** button at the bottom of the sidebar. The button
  opens the release page to download the new build; the collapsed sidebar shows
  a compact update badge instead. Localized in all five languages.

## [0.2.0] - 2026-06-21

### Added

- **Cycle terminals from the keyboard.** New `Control + Left` / `Control + Right`
  shortcuts step the active terminal through the current workspace, wrapping at
  the ends. Works in both tabs and grid mode and is rebindable in
  Settings → Keyboard.
- **"Working" indicator.** While a workspace's terminal is producing output, its
  tab shows an animated spinner instead of the static running dot.
- **Workspace finished pulse.** When a terminal finishes while you're focused
  elsewhere, its workspace tab pulses to get your attention. Focusing the
  workspace clears it; a terminal that finishes in the focused workspace doesn't
  pulse.
- **Configurable attention color.** A color picker in Settings → Appearance sets
  the pulse color (default Catppuccin peach), localized in all five languages.

### Fixed

- **Terminal now follows new output.** Live output reliably stays pinned to the
  bottom, while scrolling up to read history still pauses auto-follow as
  expected.
- Restored the `Control + Left` / `Control + Right` bindings in the
  main-process settings defaults so they persist correctly.

## [0.1.0]

- Initial release.
