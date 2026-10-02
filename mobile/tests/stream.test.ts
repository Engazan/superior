import { expect, it } from 'vitest';
import { TerminalStream } from '../src/terminal/stream';
const packet = (
  type: string,
  seq: number,
  part: number,
  last: boolean,
  data = '👋',
) => ({ type, seq, part, last, data, sessionId: 'terminal' });
it('renders an ordered chunked snapshot then live output and resets on reconnect', () => {
  const s = new TerminalStream();
  expect(s.accept(packet('terminal.snapshot', 0, 0, false))).toEqual({
    reset: true,
    data: '👋',
  });
  s.accept(packet('terminal.snapshot', 1, 1, true));
  expect(s.accept(packet('terminal.data', 2, 0, true)).reset).toBe(false);
  expect(s.accept(packet('terminal.snapshot', 0, 0, true)).reset).toBe(true);
});
it('rejects gaps, live data before snapshot, wrong chunk order and oversized snapshots', () => {
  const s = new TerminalStream();
  expect(() => s.accept(packet('terminal.data', 0, 0, true))).toThrow();
  s.accept(packet('terminal.snapshot', 0, 0, true));
  expect(() => s.accept(packet('terminal.data', 2, 0, true))).toThrow(
    'stream_gap',
  );
  expect(() => s.accept(packet('terminal.data', 1, 1, true))).toThrow();
  expect(() =>
    s.accept(packet('terminal.snapshot', 0, 0, true, 'a'.repeat(2000001))),
  ).toThrow('snapshot_too_large');
});
