# Superior mobile relay protocol (v1)

**Implementation status:** The relay server, desktop outbound connection, desktop pairing QR screen, encrypted command bridge, and Dokploy deployment files are implemented. A React Native mobile client is not included. The Superior process must remain running for remote control; its terminal daemon can keep PTYs alive after the app quits, but the relay connection then drops.

For a manual end-to-end check before the mobile app exists, [`server/scripts/phone-smoke.mjs`](../server/scripts/phone-smoke.mjs) acts as a minimal Node phone client using the same wire and encryption contract.

## Architecture

```text
Home PC: Superior main process ── local private socket ── PTY daemon
                  │ outbound WSS
                  ▼
          Superior relay on Dokploy
                  ▲
                  │ outbound WSS
          React Native phone (future)
```

The server routes by an unguessable host ID and a device ID. It verifies separate host and phone credentials, persists their hashes, tracks online peers, and forwards **opaque encrypted** payloads. It cannot decrypt terminal output. The desktop accepts a small command allowlist; the daemon's privileged local protocol is never network exposed. Each desktop installation is a separate tenant identified by its random host ID and token. There is no central user login in v1.

The server source and deployment instructions are in [`server/`](../server/README.md). The official desktop build receives `SUPERIOR_RELAY_URL` from the GitHub Actions repository variable; a local runtime variable or **Settings → Mobile relay** URL overrides it. The address has no hardcoded default. The desktop only accepts public `wss://` origins; `ws://localhost` and `ws://127.0.0.1` are allowed for development.

## Pairing

1. Start Superior and choose **Mobile access** above Workspaces in the left sidebar (or open **Settings → Mobile access**). Set the relay URL if needed, enable remote access, and wait for **Connected**.
2. Choose **Generate pairing QR code**. The QR encodes the exact JSON object with `v`, `url`, `hostId`, `deviceId`, and `master`. `master` is a 32-byte random secret encoded as base64url. Treat the whole JSON as a password. The invitation expires after five minutes and can be used once. The same JSON is available under **Show pairing data for manual transfer**.
3. The mobile app scans the QR and imports that JSON directly. Do not send the pairing secret to an external QR service. The mobile app must show the host identity/URL for confirmation before storing the pairing.
4. The phone derives an auth token from `master` and authenticates to the relay. The relay promotes the invitation to a paired device. The desktop's device list changes to **Paired**. The phone stores `master`, host ID, device ID and URL in secure storage.
5. Revoking a device in desktop Settings removes its relay authorization and local encryption key. Existing phone connections close.

The relay receives only the hash of the phone auth token when an invitation is created, then the auth token during login. It never receives `master`. Pairing data must be transferred outside the relay, directly from the owner's desktop screen to the owner's phone.

## Transport and cryptography

Connect to `<url>/ws`, e.g. `wss://superior-relay.engazan.eu/ws`. Outer messages are UTF-8 JSON with `v:1` and `t`. Send the first message within 10 seconds:

```json
{"v":1,"t":"phone.hello","hostId":"<uuid>","deviceId":"<uuid>","auth":"<base64url>"}
```

The server replies `{"v":1,"t":"phone.ready","online":true}` (or `false` if the desktop is offline). It may later send `host.online` / `host.offline`. The server pings connections every 30 seconds and terminates stale clients. Reconnect with backoff; after reconnect, request a new terminal subscription/snapshot.

Derive the 32-byte `auth` token using **HKDF-SHA256**:

- Input key material: base64url-decoded `master`.
- Salt: UTF-8 bytes of `<hostId>:<deviceId>`.
- Info: UTF-8 `superior-relay-auth-v1`.
- Output: 32 bytes, base64url encoded.

Derive a different 32-byte AES key with the same input/salt and info `superior-mobile-e2ee-v1`. Encrypt every inner JSON message with AES-256-GCM using a fresh random 12-byte nonce. The authenticated additional data is UTF-8 `superior:v1:<hostId>:<deviceId>:phone-to-host` for phone messages, or `superior:v1:<hostId>:<deviceId>:host-to-phone` for desktop messages. The packet is `nonce(12) || tag(16) || ciphertext`, base64url encoded. The different HKDF labels prevent the server's auth token from revealing the encryption key. Never reuse a nonce with the same key.

Send an encrypted inner message using outer `{"v":1,"t":"relay.data","payload":"<base64url-packet>"}`. The server returns host responses with the same outer `t` and `payload`. It cannot parse inner messages. Android/iOS networking should use the platform's normal TLS verification; do not disable certificate validation.

## Inner application messages

Each phone-to-desktop inner message has `v:1`, `type`, a **strictly increasing positive integer `seq` per device**, and a unique `requestId` for requests. Persist/increment `seq` before sending so reconnects and app restarts never reuse an older value. The desktop stores the highest accepted value and drops replays. If the phone loses its counter, revoke and re-pair it. Response messages repeat `requestId`.

| Phone request | Fields | Desktop response |
| --- | --- | --- |
| `workspaces.list` | `requestId` | `workspaces` with `{id,name}[]` |
| `sessions.list` | `requestId`, optional `workspaceId` | `sessions` with running `{id,workspaceId,label,nickname,cols,rows,createdAt,status,agentState}[]` |
| `terminal.subscribe` | `requestId`, `sessionId` | `ok`, then `terminal.snapshot` chunks, then `terminal.data` chunks |
| `terminal.unsubscribe` | `requestId`, `sessionId` | `ok` |
| `terminal.input` | `requestId`, `sessionId`, `data` | `ok` or `error` |

The desktop also sends `session.exit` with `sessionId` and `exitCode`, or `error` with `code` and optional `sessionId`/`requestId`. Only existing live sessions are accepted. `terminal.input` is limited to 8192 UTF-8 bytes. The desktop does **not** expose spawn, kill, filesystem, git, account credentials, or raw daemon control.

`terminal.snapshot` has `sessionId`, `data`, `seq`, `part`, and `last`. On `part:0`, clear the terminal view; append subsequent snapshot chunks in order. `last:true` completes the snapshot. Live `terminal.data` then appends with increasing `seq`. The snapshot is capped by the daemon's current 1.5 MB retention; older output cannot be recovered. If a connection drops, reconnect and subscribe again rather than replaying cached output. The desktop retains PTY dimensions; the phone should render at reported `cols`/`rows` and pan or scale instead of resizing a PTY shared with the desktop.

A successful input `ok` means the bytes were accepted for writing to the local daemon, not that the CLI processed them. The desktop stores the last 256 input `requestId` values per device before sending to prevent duplicate writes after uncertain delivery. The phone must **not automatically retry** input whose acknowledgement was lost; show an uncertain result and let the user inspect the terminal. If an agent prompt needs Enter, send `\r` explicitly.

The phone needs a VT/ANSI terminal renderer; parsing agent chat text out of PTY output is not part of this protocol. Agent hook state may be `working`, `waiting`, `idle`, or `unknown`. Silence alone does not establish completion.

## Limits and operational behavior

- Relay WebSocket messages are capped at 256 KiB; encrypted payload strings at 180,000 characters. The desktop splits terminal output into chunks before encrypting. Slow clients are disconnected when outgoing buffers exceed 2 MB.
- One Dokploy replica uses one persistent `relay-data` volume. Preserve/back up that volume. Scaling to multiple replicas requires shared storage and cross-replica routing.
- Pairing invitations expire in five minutes; each host supports up to 20 devices and 20 outstanding invitations. The public relay caps new host registrations to 100/hour and 10,000 total.
- The server exposes `GET /health` for liveness. Do not expose its internal HTTP port directly; route through Dokploy TLS/Traefik. Mobile and desktop traffic can include secrets even when encrypted, so do not log payloads or pairing JSON.
- The server has no push notification channel yet. A future push gateway is a separate feature. A closed desktop app is offline even if its PTYs continue running.

## Verification

The desktop crypto tests cover HKDF separation, AES-GCM round trips, direction binding and tamper detection. Server integration tests cover registration, unauthorized phone rejection, invitation, routing, revocation and persistence. Both sides typecheck/build. This execution environment forbids opening sockets, so network tests skip here; run `npm test --prefix server` in CI or on a machine that permits loopback listening before deployment.
