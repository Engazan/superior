import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// The unchanged production relay is plain ESM JavaScript.
import { createRelay } from '../../server/src/index.mjs';
import {
  decryptMobile,
  encryptMobile,
} from '../../src/main/services/mobileRelayCrypto';
import { auth, type Pairing } from '../src/relay/crypto';
import { HostStorage, type KeyStore } from '../src/relay/storage';
import { RelayClient } from '../src/relay/client';
async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
it('pairs through the real relay, paginates metadata, streams terminal data and recovers without replaying uncertain input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'superior-mobile-'));
  const relay = createRelay({ dataFile: join(dir, 'relay.json'), port: 0 });
  await relay.listen();
  const address = relay.server.address();
  if (!address || typeof address === 'string')
    throw new Error('invalid address');
  const origin = `ws://127.0.0.1:${address.port}`;
  const p: Pairing = {
    v: 1,
    url: origin,
    hostId: randomUUID(),
    deviceId: randomUUID(),
    master: randomBytes(32).toString('base64url'),
  };
  const data = new Map<string, string>();
  const store: KeyStore = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => {
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
  const storage = new HostStorage(store);
  const host = await storage.add(p, 'Test desktop');
  const client = new RelayClient(
    storage,
    randomUUID,
    async (n) => new Uint8Array(randomBytes(n)),
  );
  let hostSocket: WebSocket;
  const token = randomBytes(32).toString('base64url');
  let legacy = false;
  let inputCount = 0;
  let lastSeq = 0;
  let mutations = 0;
  const operations = new Map<string, object>();
  const openHost = async () => {
    const ws = new WebSocket(`${origin}/ws`);
    hostSocket = ws;
    await until(() => ws.readyState === 1);
    ws.addEventListener('message', (event) => {
      const frame = JSON.parse(String(event.data));
      if (frame.t !== 'relay.data') return;
      const m = decryptMobile(
        frame.payload,
        p.master,
        p.hostId,
        p.deviceId,
        'phone-to-host',
      ) as Record<string, unknown>;
      expect(m.seq as number).toBeGreaterThan(lastSeq);
      lastSeq = m.seq as number;
      const reply = (body: object) =>
        ws.send(
          JSON.stringify({
            v: 1,
            t: 'relay.data',
            deviceId: p.deviceId,
            payload: encryptMobile(
              { v: 1, requestId: m.requestId, ...body },
              p.master,
              p.hostId,
              p.deviceId,
              'host-to-phone',
            ),
          }),
        );
      switch (m.type) {
        case 'capabilities.get':
          if (legacy) {
            reply({ type: 'error', code: 'invalid_session' });
            break;
          }
          reply({
            type: 'capabilities',
            protocol: 2,
            desktopVersion: 'test',
            hostName: 'Test',
            actions: ['profiles.create'],
          });
          break;
        case 'catalog.get':
          reply({
            type: 'catalog.page',
            token: 'snapshot',
            rows: m.offset
              ? [
                  {
                    kind: 'projects',
                    value: {
                      path: '/tmp/project',
                      profileId: 'profile',
                      name: 'Project',
                      kind: 'local',
                    },
                  },
                ]
              : [
                  {
                    kind: 'profiles',
                    value: { id: 'profile', name: 'Default' },
                  },
                ],
            nextOffset: m.offset ? null : 1,
          });
          break;
        case 'workspaces.list':
          reply({
            type: 'workspaces',
            list: [{ id: 'workspace', name: 'Main' }],
          });
          break;
        case 'sessions.list':
          reply({
            type: 'sessions',
            list: [
              {
                id: 'terminal',
                workspaceId: 'workspace',
                label: 'Shell',
                cols: 80,
                rows: 24,
              },
            ],
          });
          break;
        case 'terminal.subscribe':
          reply({ type: 'ok' });
          reply({
            type: 'terminal.snapshot',
            sessionId: m.sessionId,
            seq: 0,
            part: 0,
            last: true,
            data: 'welcome 👋',
          });
          reply({
            type: 'terminal.data',
            sessionId: m.sessionId,
            seq: 1,
            part: 0,
            last: true,
            data: '$ ',
          });
          break;
        case 'terminal.unsubscribe':
          reply({ type: 'ok' });
          break;
        case 'terminal.input':
          inputCount++;
          break; // deliberately lose acknowledgement
        case 'profiles.create':
          mutations++;
          operations.set(m.requestId as string, {
            requestId: m.requestId,
            state: 'done',
            startedAt: 1,
          });
          reply({
            type: 'operation',
            operation: {
              requestId: m.requestId,
              state: 'running',
              startedAt: 1,
            },
          });
          break;
        case 'operations.get':
          reply({
            type: 'operation',
            operation: operations.get(m.operationId as string),
          });
          break;
      }
    });
    ws.send(JSON.stringify({ v: 1, t: 'host.hello', hostId: p.hostId, token }));
    return ws;
  };
  try {
    const ws = await openHost();
    await new Promise((r) => setTimeout(r, 30));
    ws.send(
      JSON.stringify({
        v: 1,
        t: 'host.invite',
        deviceId: p.deviceId,
        authHash: createHash('sha256').update(auth(p)).digest('hex'),
        expiresAt: Date.now() + 60000,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    await client.select(host);
    await until(() => client.state.catalog.projects.length === 1);
    expect(client.state.catalog.profiles[0].name).toBe('Default');
    const packets: string[] = [];
    client.onTerminal((packet) => {
      if (packet.data) packets.push(packet.data);
    });
    await client.watchTerminal('terminal');
    await until(() => packets.length === 2);
    expect(packets.join('')).toBe('welcome 👋$ ');
    const op = await client.mutate({ type: 'profiles.create', name: 'New' });
    expect(op.state).toBe('running');
    await client.refresh();
    expect(client.state.operations[0].state).toBe('done');
    expect(await storage.pending(p.hostId)).toEqual([]);
    expect(mutations).toBe(1);
    await expect(
      client.request(
        'terminal.input',
        { sessionId: 'terminal', data: 'dangerous command\r' },
        undefined,
        150,
      ),
    ).rejects.toThrow('uncertain_delivery');
    expect(inputCount).toBe(1);
    hostSocket!.close();
    await until(() => client.state.connection === 'offline');
    await openHost();
    await until(() => client.state.connection === 'online');
    await until(() => packets.length >= 4);
    expect(inputCount).toBe(1);
    const prior = lastSeq;
    client.stop();
    await client.select(host);
    await until(() => lastSeq > prior + 100);
    expect(inputCount).toBe(1);
    legacy = true;
    client.stop();
    await client.select(host);
    await until(() => client.state.catalog.profiles[0]?.id === 'legacy');
    expect(client.state.capabilities).toBeNull();
    expect(client.state.catalog.sessions[0].id).toBe('terminal');
    hostSocket!.send(
      JSON.stringify({ v: 1, t: 'host.revoke', deviceId: p.deviceId }),
    );
    await until(() => client.state.connection === 'revoked');
  } finally {
    client.stop();
    hostSocket!?.close();
    await relay.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
