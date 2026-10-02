import {
  emptyMobileCatalog,
  type CatalogRow,
  type MobileCapabilities,
  type MobileCatalog,
  type MobileMutation,
  type MobileOperation,
  type MobileUsage,
} from '@shared/mobileRelay';
import { auth, decrypt, encrypt, inputChunks } from './crypto';
import { HostStorage, Sequence, type SavedHost } from './storage';

export type Connection =
  | 'disconnected'
  | 'connecting'
  | 'relay'
  | 'online'
  | 'offline'
  | 'reconnecting'
  | 'revoked';
export interface RelayState {
  connection: Connection;
  catalog: MobileCatalog;
  capabilities: MobileCapabilities | null;
  usage: MobileUsage[];
  operations: MobileOperation[];
  error: string;
  updatedAt: number | null;
}
export interface TerminalPacket {
  type: string;
  sessionId: string;
  data?: string;
  seq?: number;
  part?: number;
  last?: boolean;
  exitCode?: number;
}
interface Socket {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
}
interface Pending {
  resolve(value: Record<string, unknown>): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
export class RelayClient {
  state: RelayState = {
    connection: 'disconnected',
    catalog: emptyMobileCatalog(),
    capabilities: null,
    usage: [],
    operations: [],
    error: '',
    updatedAt: null,
  };
  private listeners = new Set<() => void>();
  private terminalListeners = new Set<(packet: TerminalPacket) => void>();
  private socket: Socket | null = null;
  private host: SavedHost | null = null;
  private sequence: Sequence | null = null;
  private generation = 0;
  private retry = 1000;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;
  private pending = new Map<string, Pending>();
  private outbox: Promise<void> = Promise.resolve();
  private syncing = false;
  private loadingUsage = false;
  private terminalId: string | null = null;
  private legacy = false;
  private desired = false;
  constructor(
    readonly storage: HostStorage,
    private readonly uuid: () => string,
    private readonly random: (count: number) => Promise<Uint8Array>,
    private readonly createSocket: (url: string) => Socket = (url) =>
      new WebSocket(url),
  ) {}
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): RelayState => this.state;
  private update(patch: Partial<RelayState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  onTerminal(listener: (packet: TerminalPacket) => void): () => void {
    this.terminalListeners.add(listener);
    return () => this.terminalListeners.delete(listener);
  }
  private emit(packet: TerminalPacket): void {
    for (const listener of this.terminalListeners) listener(packet);
  }
  async select(host: SavedHost | null): Promise<void> {
    this.stop();
    this.host = host;
    this.terminalId = null;
    this.update({
      catalog: emptyMobileCatalog(),
      usage: [],
      capabilities: null,
      operations: [],
      updatedAt: null,
      error: '',
    });
    if (!host) return;
    this.sequence = new Sequence(
      this.storage.store,
      host.id,
      host.pairing.deviceId,
    );
    await this.storage.store.set('superior.selected', host.id);
    this.resume();
  }
  stop(): void {
    this.desired = false;
    this.disconnect();
    this.update({ connection: 'disconnected' });
  }
  private disconnect(): void {
    this.generation++;
    clearTimeout(this.retryTimer);
    clearTimeout(this.handshake);
    const ws = this.socket;
    this.socket = null;
    ws?.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('connection_lost'));
    }
    this.pending.clear();
    this.outbox = Promise.resolve();
    this.syncing = false;
    this.loadingUsage = false;
  }
  resume(): void {
    if (!this.host || this.socket || this.state.connection === 'revoked')
      return;
    this.desired = true;
    this.connect();
  }
  private connect(): void {
    if (!this.host || !this.desired) return;
    const host = this.host;
    const generation = ++this.generation;
    this.update({ connection: 'connecting', error: '' });
    let ws: Socket;
    try {
      ws = this.createSocket(`${host.pairing.url}/ws`);
    } catch {
      this.reconnect(generation);
      return;
    }
    this.socket = ws;
    const valid = () => this.socket === ws && this.generation === generation;
    this.handshake = setTimeout(() => {
      if (valid()) ws.close();
    }, 10000);
    ws.onopen = () => {
      if (valid()) {
        this.update({ connection: 'relay' });
        ws.send(
          JSON.stringify({
            v: 1,
            t: 'phone.hello',
            hostId: host.pairing.hostId,
            deviceId: host.pairing.deviceId,
            auth: auth(host.pairing),
          }),
        );
      }
    };
    ws.onmessage = (event) => {
      if (!valid()) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > 262144)
          throw new Error('invalid_packet');
        const outer = JSON.parse(event.data) as Record<string, unknown>;
        if (outer.t === 'phone.ready') {
          clearTimeout(this.handshake);
          this.retry = 1000;
          this.update({
            connection: outer.online ? 'online' : 'offline',
            error: '',
          });
          if (outer.online) void this.ready(generation);
        } else if (outer.t === 'host.online') {
          this.update({ connection: 'online', error: '' });
          void this.ready(generation);
        } else if (outer.t === 'host.offline') {
          this.update({ connection: 'offline' });
          this.emit({ type: 'disconnected', sessionId: this.terminalId ?? '' });
        } else if (
          outer.t === 'relay.data' &&
          typeof outer.payload === 'string'
        ) {
          const message = decrypt(host.pairing, outer.payload);
          if (message.v !== 1 || typeof message.type !== 'string')
            throw new Error('invalid_packet');
          const entry =
            typeof message.requestId === 'string'
              ? this.pending.get(message.requestId)
              : null;
          if (entry) {
            this.pending.delete(message.requestId as string);
            clearTimeout(entry.timer);
            if (message.type === 'error')
              entry.reject(new Error(String(message.code || 'request_failed')));
            else entry.resolve(message);
          }
          if (
            typeof message.sessionId === 'string' &&
            message.sessionId === this.terminalId
          )
            this.emit(message as unknown as TerminalPacket);
        } else if (outer.t === 'error') {
          this.update({ error: String(outer.code || 'relay_error') });
        }
      } catch {
        this.update({ error: 'invalid_packet' });
        ws.close();
      }
    };
    ws.onerror = () => {
      if (valid()) this.update({ error: 'connection_failed' });
    };
    ws.onclose = (event) => {
      if (!valid()) return;
      const revoked =
        event.code === 1008 && /authentication|revoked/.test(event.reason);
      this.disconnect();
      this.emit({ type: 'disconnected', sessionId: this.terminalId ?? '' });
      if (revoked) {
        this.desired = false;
        this.update({ connection: 'revoked', error: 'pair_again' });
      } else if (event.reason === 'replaced') {
        this.desired = false;
        this.update({
          connection: 'disconnected',
          error: 'connection_replaced',
        });
      } else this.reconnect(this.generation);
    };
  }
  private reconnect(generation: number): void {
    if (!this.desired || generation !== this.generation) return;
    this.update({ connection: 'reconnecting' });
    this.retryTimer = setTimeout(
      () => {
        if (generation === this.generation) this.connect();
      },
      this.retry * (0.75 + Math.random() * 0.5),
    );
    this.retry = Math.min(30000, this.retry * 2);
  }
  request(
    type: string,
    fields: object = {},
    requestId = this.uuid(),
    timeout = 15000,
  ): Promise<Record<string, unknown>> {
    if (!this.host || !this.socket || this.state.connection !== 'online')
      return Promise.reject(new Error('desktop_offline'));
    const generation = this.generation;
    const ws = this.socket;
    const host = this.host;
    const sequence = this.sequence!;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            type === 'terminal.input'
              ? 'uncertain_delivery'
              : 'request_timeout',
          ),
        );
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
    });
    this.outbox = this.outbox
      .catch(() => {})
      .then(async () => {
        if (
          !this.pending.has(requestId) ||
          generation !== this.generation ||
          ws.readyState !== 1 ||
          ws.bufferedAmount > 256000
        )
          throw new Error('connection_lost');
        const seq = await sequence.next();
        const nonce = await this.random(12);
        if (!this.pending.has(requestId) || generation !== this.generation)
          throw new Error('connection_lost');
        ws.send(
          JSON.stringify({
            v: 1,
            t: 'relay.data',
            payload: encrypt(
              host.pairing,
              { ...fields, v: 1, type, seq, requestId },
              nonce,
            ),
          }),
        );
        // Coalesce native keyboard activity below the relay's 200 frames/s budget.
        await new Promise((resolve) => setTimeout(resolve, 20));
      })
      .catch((error) => {
        const p = this.pending.get(requestId);
        if (p) {
          this.pending.delete(requestId);
          clearTimeout(p.timer);
          p.reject(error);
        }
      });
    return promise;
  }
  private async ready(generation: number): Promise<void> {
    try {
      try {
        const response = await this.request('capabilities.get');
        if (response.protocol !== 2 || !Array.isArray(response.actions))
          throw new Error('unsupported_protocol');
        if (generation !== this.generation) return;
        this.legacy = false;
        this.update({
          capabilities: response as unknown as MobileCapabilities,
        });
      } catch (error) {
        if (
          !/^(unsupported_action|invalid_session)$/.test(
            (error as Error).message,
          )
        )
          throw error;
        if (generation !== this.generation) return;
        this.legacy = true;
        this.update({ capabilities: null });
      }
      if (generation !== this.generation) return;
      await this.refresh();
      if (generation !== this.generation) return;
      if (this.terminalId) await this.watchTerminal(this.terminalId);
    } catch (error) {
      if (generation === this.generation)
        this.update({ error: (error as Error).message });
    }
  }
  async refresh(): Promise<void> {
    if (this.syncing || this.state.connection !== 'online') return;
    this.syncing = true;
    const generation = this.generation;
    try {
      const data = emptyMobileCatalog();
      if (this.legacy) {
        const [workspaces, sessions] = await Promise.all([
          this.request('workspaces.list'),
          this.request('sessions.list'),
        ]);
        data.profiles = [{ id: 'legacy', name: 'Superior' }];
        data.projects = [
          {
            path: 'legacy',
            name: 'Workspaces',
            profileId: 'legacy',
            kind: 'local',
          },
        ];
        data.workspaces = (workspaces.list as MobileCatalog['workspaces']).map(
          (w) => ({ ...w, folderPath: 'legacy', worktree: false }),
        );
        data.sessions = sessions.list as MobileCatalog['sessions'];
      } else {
        let complete = false;
        let cursor: { token?: string; offset?: number } = {};
        for (let page = 0; page < 1000; page++) {
          const response = await this.request('catalog.get', cursor);
          if (
            !Array.isArray(response.rows) ||
            typeof response.token !== 'string'
          )
            throw new Error('invalid_packet');
          for (const row of response.rows as CatalogRow[]) {
            if (
              !Object.hasOwn(data, row.kind) ||
              !row.value ||
              typeof row.value !== 'object'
            )
              throw new Error('invalid_packet');
            (data[row.kind] as unknown[]).push(row.value);
          }
          if (response.nextOffset === null) {
            complete = true;
            break;
          }
          if (
            !Number.isSafeInteger(response.nextOffset) ||
            (response.nextOffset as number) <= (cursor.offset ?? 0)
          )
            throw new Error('invalid_packet');
          cursor = {
            token: response.token,
            offset: response.nextOffset as number,
          };
        }
        if (!complete) throw new Error('catalog_too_large');
      }
      if (generation !== this.generation) return;
      this.update({ catalog: data, updatedAt: Date.now(), error: '' });
      if (!this.legacy && this.host) {
        const ids = await this.storage.pending(this.host.id);
        for (const id of ids) {
          const response = await this.request('operations.get', {
            operationId: id,
          });
          if (generation !== this.generation) return;
          const operation = response.operation as MobileOperation | null;
          await this.record(
            operation ?? {
              requestId: id,
              state: 'uncertain',
              startedAt: Date.now(),
            },
          );
        }
      }
    } catch (error) {
      if (generation === this.generation)
        this.update({ error: (error as Error).message });
    } finally {
      if (generation === this.generation) this.syncing = false;
    }
  }
  async usage(force = false): Promise<void> {
    if (this.loadingUsage || this.state.connection !== 'online') return;
    this.loadingUsage = true;
    const generation = this.generation;
    const list: MobileUsage[] = [];
    let offset = 0;
    try {
      do {
        const response = await this.request(
          'usage.get',
          { force, offset },
          undefined,
          240000,
        );
        if (!Array.isArray(response.list)) throw new Error('invalid_packet');
        list.push(...(response.list as MobileUsage[]));
        if (generation !== this.generation) return;
        if (response.nextOffset === null) break;
        if (
          !Number.isSafeInteger(response.nextOffset) ||
          (response.nextOffset as number) <= offset
        )
          throw new Error('invalid_packet');
        offset = response.nextOffset as number;
      } while (offset < 2000);
      if (offset >= 2000) throw new Error('usage_too_large');
      if (generation === this.generation) this.update({ usage: list });
    } catch (error) {
      if (generation === this.generation)
        this.update({ error: (error as Error).message });
    } finally {
      if (generation === this.generation) this.loadingUsage = false;
    }
  }
  async mutate(action: MobileMutation): Promise<MobileOperation> {
    if (this.state.connection !== 'online') throw new Error('desktop_offline');
    if (!this.host || !this.state.capabilities?.actions.includes(action.type))
      throw new Error('update_desktop');
    const host = this.host;
    const id = this.uuid();
    const generation = this.generation;
    await this.storage.changePending(host.id, (ids) => [...ids, id]);
    try {
      const { type, ...fields } = action;
      const response = await this.request(type, fields, id);
      const op = response.operation as MobileOperation;
      if (!op || op.requestId !== id) throw new Error('invalid_packet');
      if (generation === this.generation) await this.record(op);
      return op;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          operations: [
            ...this.state.operations,
            { requestId: id, state: 'uncertain', startedAt: Date.now() },
          ],
        });
      throw error;
    }
  }
  private async record(operation: MobileOperation): Promise<void> {
    this.update({
      operations: [
        ...this.state.operations.filter(
          (o) => o.requestId !== operation.requestId,
        ),
        operation,
      ].slice(-20),
    });
    if (this.host && operation.state !== 'running')
      await this.storage.changePending(this.host.id, (ids) =>
        ids.filter((id) => id !== operation.requestId),
      );
  }
  async watchTerminal(id: string | null): Promise<void> {
    const previous = this.terminalId;
    this.terminalId = id;
    if (previous && previous !== id && this.state.connection === 'online')
      await this.request('terminal.unsubscribe', { sessionId: previous }).catch(
        () => {},
      );
    if (id && this.state.connection === 'online') {
      this.emit({ type: 'reset', sessionId: id });
      await this.request('terminal.subscribe', { sessionId: id });
    }
  }
  async input(id: string, data: string): Promise<void> {
    try {
      for (const chunk of inputChunks(data))
        await this.request('terminal.input', { sessionId: id, data: chunk });
    } catch {
      throw new Error('uncertain_delivery');
    }
  }
}
