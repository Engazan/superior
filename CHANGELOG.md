# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
