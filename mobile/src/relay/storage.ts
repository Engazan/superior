import type { Pairing } from './crypto';
export interface KeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface SavedHost {
  id: string;
  name: string;
  pairing: Pairing;
}
const INDEX = 'superior.hosts';
const key = (id: string) => `superior.host.${id}`;
export class HostStorage {
  private changes: Promise<void> = Promise.resolve();
  constructor(readonly store: KeyStore) {}
  changePending(
    id: string,
    change: (ids: string[]) => string[],
  ): Promise<void> {
    const task = this.changes
      .catch(() => {})
      .then(async () => this.savePending(id, change(await this.pending(id))));
    this.changes = task;
    return task;
  }
  async list(): Promise<SavedHost[]> {
    const ids: string[] = JSON.parse((await this.store.get(INDEX)) ?? '[]');
    const hosts = await Promise.all(
      ids.map(async (id) => {
        const value = await this.store.get(key(id));
        return value ? (JSON.parse(value) as SavedHost) : null;
      }),
    );
    return hosts.filter((h): h is SavedHost => !!h);
  }
  async add(pairing: Pairing, name: string): Promise<SavedHost> {
    const hosts = await this.list();
    if (hosts.length >= 20 && !hosts.some((h) => h.id === pairing.hostId))
      throw new Error('host_limit');
    const previous = hosts.find((h) => h.id === pairing.hostId);
    // Re-importing the same device must never reset its replay counter.
    if (previous?.pairing.deviceId === pairing.deviceId)
      throw new Error('already_paired');
    const host = {
      id: pairing.hostId,
      name: name.trim().slice(0, 100) || pairing.hostId.slice(0, 8),
      pairing,
    };
    const counterKey = `${key(host.id)}.${pairing.deviceId}.seq`;
    const counter = await this.store.get(counterKey);
    if (counter === null) await this.store.set(counterKey, '0');
    else if (!/^\d+$/.test(counter) || !Number.isSafeInteger(Number(counter)))
      throw new Error('sequence_lost');
    await this.store.set(`${key(host.id)}.operations`, '[]');
    await this.store.set(key(host.id), JSON.stringify(host));
    await this.store.set(
      INDEX,
      JSON.stringify([...new Set([...hosts.map((h) => h.id), host.id])]),
    );
    await this.store.set('superior.selected', host.id);
    return host;
  }
  async rename(id: string, name: string): Promise<void> {
    const host = (await this.list()).find((h) => h.id === id);
    if (!host) return;
    host.name = name.trim().slice(0, 100) || host.name;
    await this.store.set(key(id), JSON.stringify(host));
  }
  async remove(id: string): Promise<void> {
    const hosts = await this.list();
    await this.store.set(
      INDEX,
      JSON.stringify(hosts.filter((h) => h.id !== id).map((h) => h.id)),
    );
    // Retain non-secret counter reservations so re-importing an old pairing cannot reset replay protection.
    for (const suffix of ['', '.seq', '.operations'])
      await this.store.remove(`${key(id)}${suffix}`);
  }
  async pending(id: string): Promise<string[]> {
    return JSON.parse((await this.store.get(`${key(id)}.operations`)) ?? '[]');
  }
  async savePending(id: string, ids: string[]): Promise<void> {
    await this.store.set(`${key(id)}.operations`, JSON.stringify(ids));
  }
}
export class Sequence {
  private value = 0;
  private reserved = 0;
  private initialized = false;
  constructor(
    private readonly store: KeyStore,
    private readonly hostId: string,
    private readonly deviceId: string,
  ) {}
  async next(): Promise<number> {
    if (!this.initialized) {
      const raw = await this.store.get(
        `${key(this.hostId)}.${this.deviceId}.seq`,
      );
      if (
        raw === null ||
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(Number(raw)) ||
        Number(raw) < 0
      )
        throw new Error('sequence_lost');
      this.value = this.reserved = Number(raw);
      this.initialized = true;
    }
    if (this.value === this.reserved) {
      if (this.value > Number.MAX_SAFE_INTEGER - 256)
        throw new Error('sequence_lost');
      const next = this.value + 256;
      await this.store.set(
        `${key(this.hostId)}.${this.deviceId}.seq`,
        String(next),
      );
      this.reserved = next;
    }
    return ++this.value;
  }
}
