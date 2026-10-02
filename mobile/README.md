# Superior Mobile

Native iOS/Android companion built with Expo SDK 57 and Expo Router. It connects
through `wss://superior-relay.engazan.eu/ws` to a running, paired Superior desktop.
The relay only transports encrypted packets; it never receives terminal input,
output, project metadata or account usage in plaintext.

## Run

```sh
cd mobile
npm ci
npm start
```

Open a native development build, or use `npm run ios` / `npm run android` with a
compatible simulator/device. `expo-dev-client` is included for the EAS development profile. Internal preview
builds use `npx eas-cli@latest build --profile preview --platform ios` (or
`android`). EAS requires your Expo account and platform signing configuration.
Generated native projects, pairing secrets and signing files stay out of Git.
The Expo build-properties plugin enables the scene lifecycle required by Xcode 27
and iOS 27; `expo prebuild` generates this configuration automatically.

On the desktop, enable **Mobile access**, create a QR code, then use **Pair
desktop** on the phone. Alternatively paste the pairing JSON. Check the relay
origin and desktop identifier before confirming. Codes contain a secret and
expire on the relay; generate a new one if pairing fails. Imported credentials
and replay counters live in the platform SecureStore, not AsyncStorage or URLs.
Pairing another phone requires a separate desktop invitation. Forgetting a host
only deletes local credentials; revoke the phone on the desktop to remove access.

## Features

- Multi-host selection; profile → project → workspace/worktree → terminal navigation.
- Profile name/color management, registered project metadata and absolute desktop
  path registration, workspace/worktree creation and removal, existing/new Git branches.
- Create terminals from desktop presets (including Shell), choose a desktop tab,
  and stop terminals with confirmation. Removal previews count affected workspaces
  and sessions and require a second confirmation to force dirty worktrees.
- Offline-bundled xterm.js in a restricted WebView, Unicode/ANSI output, search,
  native selection/copy, font size, scroll-to-bottom, prompt/paste and control keys.
  Existing desktop PTYs retain their dimensions; mobile resizes its own display only.
- Read-only Claude/Codex usage for default and custom accounts, reset times, plans,
  credits and refresh timestamps. Provider credentials remain on the desktop.
- English, Slovak, Czech, Polish and Hungarian; system language and light/dark theme.

The connection closes in the background and reconnects in the foreground with
backoff and a fresh catalog/terminal snapshot. Catalog polling is every two seconds;
usage refreshes every minute while the Usage screen is active. Input is never
retried automatically after an uncertain acknowledgement. Check the terminal
and reconnect before sending again. CRUD operations have durable request IDs;
status is recovered after reconnect instead of resubmitting the action.
Older desktops retain terminal browsing through legacy requests and display an
update notice for newer features. This version does not clone repositories, expose
a file browser/editor, resize desktop PTYs, or run background/push connections.
The web target is a build smoke check; pairing and terminal operation are native only.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx expo-doctor
npx expo export --platform ios --platform android --output-dir build/bundles
npm run export:web
```

`npm ci` generates the local terminal document through `postinstall`. The source
is `src/terminal/document.ts`; no CDN, external script or remote terminal page is
loaded. Metro watches `../src/shared` for public DTOs. Tests include desktop/native
crypto interoperability, durable counter reservations, stream continuity, operation
journaling and real local relay pairing/reconnect/revocation. CI runs mobile checks
and Hermes bundle generation separately from desktop checks.

## Device acceptance

Before distributing a signed build, test on a real iPhone and Android phone:

1. Pair with a fresh QR; verify camera permission denial and manual pairing.
2. Add a temporary project, create/rename a profile and workspace, create a clean
   worktree on a new/existing branch, and launch a Shell/preset in a selected tab.
3. Verify ANSI colors, Unicode, alternate-screen apps, keyboard/control keys,
   scrolling, selection/copy and search. Confirm desktop terminal size is unchanged.
4. Background/foreground the app, toggle networking, and restart the desktop.
   Verify a fresh snapshot, operation status and no repeated terminal input.
5. Check usage refresh and expired/not-signed-in/rate-limited accounts. Confirm no
   credentials or account directories appear in mobile packets/UI.
6. Verify dirty-worktree warnings, cascade counts, terminal kill, phone revocation,
   multiple hosts, every language and both themes. Remove the temporary project.

Bundle generation and local relay integration do not substitute for these native
keyboard, camera and WebView checks. Production relay health can be checked without
pairing at `https://superior-relay.engazan.eu/health`; a live desktop test requires
its owner’s local pairing code.
