# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
