import { describe, expect, it } from 'vitest';
import {
  mobileAuth,
  encryptMobile,
  decryptMobile,
} from '../../desktop/src/main/services/mobileRelayCrypto';
import {
  auth,
  decrypt,
  encrypt,
  inputChunks,
  parsePairing,
  toBase64,
  fromBase64,
  type Pairing,
} from '../src/relay/crypto';
export const pairing: Pairing = {
  v: 1,
  url: 'wss://superior-relay.engazan.eu',
  hostId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  master: toBase64(new Uint8Array(32).fill(42)),
};
describe('desktop / native wire compatibility', () => {
  it('derives the existing relay authentication key exactly', () =>
    expect(auth(pairing)).toBe(
      mobileAuth(pairing.master, pairing.hostId, pairing.deviceId),
    ));
  it('encrypts phone input readable by the desktop and reads desktop Unicode snapshots', () => {
    const value = {
      v: 1,
      type: 'terminal.input',
      data: 'echo Ahoj 👋\r',
      seq: 1,
    };
    expect(
      decryptMobile(
        encrypt(pairing, value, new Uint8Array(12).fill(7)),
        pairing.master,
        pairing.hostId,
        pairing.deviceId,
        'phone-to-host',
      ),
    ).toEqual(value);
    const packet = encryptMobile(
      value,
      pairing.master,
      pairing.hostId,
      pairing.deviceId,
      'host-to-phone',
    );
    expect(decrypt(pairing, packet)).toEqual(value);
  });
  it('rejects tampering, different devices and direction reflection', () => {
    const packet = encryptMobile(
      { v: 1 },
      pairing.master,
      pairing.hostId,
      pairing.deviceId,
      'host-to-phone',
    );
    expect(() =>
      decrypt({ ...pairing, deviceId: pairing.hostId }, packet),
    ).toThrow();
    expect(() =>
      decrypt(
        pairing,
        `${packet.slice(0, 35)}${packet[35] === 'a' ? 'b' : 'a'}${packet.slice(36)}`,
      ),
    ).toThrow();
    expect(() =>
      decrypt(pairing, encrypt(pairing, { v: 1 }, new Uint8Array(12))),
    ).toThrow();
  });
  it('requires a secure relay origin and discards unexpected fields', () => {
    expect(
      parsePairing(JSON.stringify({ ...pairing, extra: 'secret' })),
    ).toEqual(pairing);
    for (const url of [
      'https://example.org',
      'ws://example.org',
      'wss://user:pass@example.org',
      'wss://example.org/ws',
      'wss://example.org?key=secret',
    ])
      expect(() => parsePairing(JSON.stringify({ ...pairing, url }))).toThrow();
    expect(
      parsePairing(
        JSON.stringify({ ...pairing, url: 'ws://localhost:9999' }),
        true,
      ).url,
    ).toBe('ws://localhost:9999');
  });
  it('splits large keyboard/paste input on Unicode boundaries under the desktop limit', () => {
    const value = '👋ž'.repeat(9000);
    const chunks = inputChunks(value);
    expect(chunks.join('')).toBe(value);
    expect(chunks.every((c) => Buffer.byteLength(c) <= 8192)).toBe(true);
  });
});

it('encodes base64url without relying on browser globals in Hermes', () => {
  for (const size of [1, 2, 3, 12, 32, 255, 8192]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  }
  expect(() => fromBase64('AB')).toThrow();
});
