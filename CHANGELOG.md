# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
