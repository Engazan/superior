import { describe, expect, it } from 'vitest';
import { DraftStore } from '../src/relay/drafts';
function fixture() {
  const values = new Map<string, string>();
  const store = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => { values.set(key, value); },
    remove: async (key: string) => { values.delete(key); },
  };
  return { values, store, drafts: new DraftStore(store) };
}
describe('mobile drafts', () => {
  it('restores Unicode across restart and isolates hosts and sessions', async () => {
    const { drafts, store, values } = fixture();
    const text = 'Žltý 🐳\n'.repeat(300);
    await drafts.write('host', 'one', text);
    await drafts.write('other', 'one', 'elsewhere');
    expect(await new DraftStore(store).read('host', 'one')).toBe(text);
    expect(await drafts.read('host', 'two')).toBe('');
    expect(Math.max(...[...values.values()].map(v => new TextEncoder().encode(v).length))).toBeLessThan(2048);
  });
  it('serializes rapid changes and clears committed content', async () => {
    const { drafts, values } = fixture();
    await Promise.all([drafts.write('h', 's', 'first'), drafts.write('h', 's', 'last')]);
    expect(await drafts.read('h', 's')).toBe('last');
    await drafts.write('h', 's', '');
    expect(await drafts.read('h', 's')).toBe('');
    expect([...values.values()].some(v => v === 'last')).toBe(false);
  });
  it('keeps the committed draft when the next write fails', async () => {
    const { drafts, store } = fixture();
    await drafts.write('h', 's', 'keep');
    store.set = async () => { throw new Error('full'); };
    await expect(drafts.write('h', 's', 'new')).rejects.toThrow('full');
    expect(await drafts.read('h', 's')).toBe('keep');
  });
});
