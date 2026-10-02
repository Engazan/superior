import { expect, it } from 'vitest';
import { HostStorage, Sequence, type KeyStore } from '../src/relay/storage';
import { toBase64, type Pairing } from '../src/relay/crypto';
const p: Pairing = {
  v: 1,
  url: 'wss://example.org',
  hostId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  master: toBase64(new Uint8Array(32)),
};
function memory() {
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
  return { data, store };
}
it('reserves replay counters before use and skips reserved values after restart', async () => {
  const { store, data } = memory();
  const hosts = new HostStorage(store);
  await hosts.add(p, 'Mac');
  const seq = new Sequence(store, p.hostId, p.deviceId);
  expect(await seq.next()).toBe(1);
  expect(data.get(`superior.host.${p.hostId}.${p.deviceId}.seq`)).toBe('256');
  expect(await seq.next()).toBe(2);
  expect(await new Sequence(store, p.hostId, p.deviceId).next()).toBe(257);
  await expect(hosts.add(p, 'Mac')).rejects.toThrow('already_paired');
});
it('fails closed when storage is lost or reservation cannot persist', async () => {
  const { store } = memory();
  await expect(
    new Sequence(store, p.hostId, p.deviceId).next(),
  ).rejects.toThrow('sequence_lost');
  await new HostStorage(store).add(p, 'Mac');
  store.set = async () => {
    throw new Error('disk');
  };
  await expect(
    new Sequence(store, p.hostId, p.deviceId).next(),
  ).rejects.toThrow('disk');
});
it('keeps the old device counter safe while replacing a pairing and removes local secrets', async () => {
  const { store, data } = memory();
  const hosts = new HostStorage(store);
  await hosts.add(p, 'Mac');
  await new Sequence(store, p.hostId, p.deviceId).next();
  await hosts.add({ ...p, deviceId: p.hostId }, 'New');
  expect(data.get(`superior.host.${p.hostId}.${p.deviceId}.seq`)).toBe('256');
  await hosts.remove(p.hostId);
  expect(await hosts.list()).toEqual([]);
  expect(data.has(`superior.host.${p.hostId}`)).toBe(false);
});
it('serializes pending operation edits so concurrent requests do not lose recovery IDs', async () => {
  const { store } = memory();
  const hosts = new HostStorage(store);
  await Promise.all([
    hosts.changePending('host', (ids) => [...ids, 'one']),
    hosts.changePending('host', (ids) => [...ids, 'two']),
  ]);
  expect(await hosts.pending('host')).toEqual(['one', 'two']);
});

it('never resets replay protection when a forgotten pairing is imported again', async () => {
  const { store } = memory();
  const hosts = new HostStorage(store);
  await hosts.add(p, 'Mac');
  await new Sequence(store, p.hostId, p.deviceId).next();
  await hosts.remove(p.hostId);
  await hosts.add(p, 'Mac');
  expect(await new Sequence(store, p.hostId, p.deviceId).next()).toBe(257);
});
