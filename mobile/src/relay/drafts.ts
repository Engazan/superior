import type { KeyStore } from './storage';

/** Two slots keep the last committed draft readable if a write is interrupted. */
export class DraftStore {
  private pending: Promise<void> = Promise.resolve();
  constructor(private store: KeyStore) {}
  private key(host: string, session: string): string {
    const encode = (value: string) => Array.from(value).map(c => c.codePointAt(0)!.toString(16)).join('_');
    return `superior.draft.${encode(host)}.${encode(session)}`;
  }
  async read(host: string, session: string): Promise<string> {
    await this.pending.catch(() => {});
    const key = this.key(host, session);
    const raw = await this.store.get(key);
    if (!raw) return '';
    const { slot, count } = JSON.parse(raw);
    if ((slot !== 0 && slot !== 1) || !Number.isInteger(count) || count < 0 || count > 400) throw new Error('Invalid saved draft');
    const chunks = await Promise.all(Array.from({ length: count }, (_, i) => this.store.get(`${key}.${slot}.${i}`)));
    if (chunks.some(c => c === null)) throw new Error('Incomplete saved draft');
    return chunks.join('');
  }
  write(host: string, session: string, text: string): Promise<void> {
    const operation = this.pending.catch(() => {}).then(async () => {
      if (text.length > 100_000) throw new Error('Draft exceeds 100,000 characters');
      const key = this.key(host, session);
      const previous = JSON.parse((await this.store.get(key)) ?? '{"slot":1,"count":0}');
      const slot = previous.slot === 0 ? 1 : 0;
      // 250 UTF-16 units remain below native SecureStore payload limits.
      const characters = Array.from(text);
      const chunks: string[] = [];
      for (let i = 0; i < characters.length; i += 250) chunks.push(characters.slice(i, i + 250).join(''));
      for (let i = 0; i < chunks.length; i++) await this.store.set(`${key}.${slot}.${i}`, chunks[i]);
      await this.store.set(key, JSON.stringify({ slot, count: chunks.length }));
      for (let i = 0; i < previous.count; i++) await this.store.remove(`${key}.${previous.slot}.${i}`);
    });
    this.pending = operation;
    return operation;
  }
}
