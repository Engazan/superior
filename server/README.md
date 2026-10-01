# Superior relay

The relay routes encrypted terminal traffic between a running Superior desktop and a paired phone. It does not run agents, read terminal output, or store source files. The relay server and desktop client are implemented; the mobile app is still to be built against [the protocol](../docs/mobile-companion.md).

## Deploy with Dokploy

1. Point the DNS **A** record for `superior-relay.engazan.eu` to the Dokploy server. Add an AAAA record only if IPv6 reaches that server.
2. In Dokploy, create a **Docker Compose** service from the `Engazan/superior` Git repository. Set **Compose Path** to `./server/compose.yaml`. The Compose build uses `server/Dockerfile`; no external image is required.
3. In its Compose environment editor, set:

   ```dotenv
   SUPERIOR_RELAY_DOMAIN=superior-relay.engazan.eu
   SUPERIOR_RELAY_URL=wss://superior-relay.engazan.eu
   SUPERIOR_RELAY_PORT=8080
   SUPERIOR_RELAY_CERT_RESOLVER=letsencrypt
   ```

   `SUPERIOR_RELAY_IMAGE` is optional; its default is `superior-relay:local`. Change the certificate resolver if your Dokploy installation uses another name. The `dokploy-network` external network and Traefik `websecure` entrypoint must exist.
4. Deploy the Compose service. This file already defines Traefik domain/TLS labels. **Do not add the same domain again in Dokploy's Domains tab.** Confirm a valid TLS certificate and `https://superior-relay.engazan.eu/health` returning `{"ok":true}`.
5. Keep the `relay-data` Docker volume across redeploys and back it up. It contains host credentials and paired-device verifiers. Removing it invalidates host registration and every pairing. Never publish port 8080 directly to the internet; Traefik provides HTTPS/WSS.

The GitHub Actions repository variable `SUPERIOR_RELAY_URL=wss://superior-relay.engazan.eu` is separate from the Dokploy Compose environment. The release workflow embeds it into official desktop builds. Local desktop builds can use a runtime `SUPERIOR_RELAY_URL` environment variable or set a URL in **Settings → Mobile relay**.

In Superior, open **Settings → Mobile relay**, enable remote access, and wait for **Connected**. Generate pairing data on the desktop and import it in the future mobile app within five minutes. The Superior process must remain running for the connection; terminal PTYs may persist after the app quits, but the relay link does not.

## Local development

```bash
cd server
npm ci
RELAY_DATA_FILE=./data/relay.json HOST=127.0.0.1 PORT=8080 npm start
npm test
```

The local server listens on HTTP; use it only on loopback during development. Desktop builds accept `ws://localhost:8080` for local testing; public endpoints must use `wss://`. The WebSocket path is `/ws`. `GET /health` is a liveness endpoint.

To exercise pairing and terminal streaming **before the React Native app exists**, save the desktop's generated pairing JSON to a private file, then run `npm run smoke:phone -- /path/to/pairing.json` from `server/`. The script connects as a phone, lists sessions, subscribes to the first running one and sends each line you type followed by Enter. It stores a monotonic message counter in `/path/to/pairing.json.seq`; keep that file while testing the same pairing. Delete both files and revoke the test device when done. The pairing file contains the device's long-term encryption secret.

## Data and limits

The server stores randomly generated host IDs, hashes of host tokens, device authentication hashes, and short-lived invitation metadata in `/data/relay.json` with owner-only permissions. It never stores device encryption keys or terminal content. Host registration is capped at 100 new hosts per hour and 10,000 total per server; each host is limited to 20 devices and 20 outstanding invitations. Messages are capped at 256 KiB, slow clients are closed, and dead connections are removed by heartbeat.

The server is a single-instance service. Do not start two replicas against the same JSON volume: they would have independent connection maps and conflicting writes. Multi-instance operation requires a shared durable database and routing layer.

## References

- [Dokploy Docker Compose setup](https://github.com/dokploy/website/blob/main/apps/docs/content/docs/core/docker-compose/example.mdx)
- [Dokploy Compose environment](https://github.com/dokploy/website/blob/main/apps/docs/content/docs/core/docker-compose/index.mdx)
- [Dokploy Compose domains](https://github.com/dokploy/website/blob/main/apps/docs/content/docs/core/docker-compose/domains.mdx)
