import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

export interface Pairing {
  v: 1;
  url: string;
  hostId: string;
  deviceId: string;
  master: string;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const alphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toBase64(bytes: Uint8Array): string {
  const result: string[] = [];
  let word = 0;
  let bits = 0;
  for (const byte of bytes) {
    word = (word << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result.push(alphabet[(word >>> bits) & 63]);
    }
    word &= (1 << bits) - 1;
  }
  if (bits) result.push(alphabet[(word << (6 - bits)) & 63]);
  return result.join('');
}
export function fromBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new Error('invalid_pairing');
  const result = new Uint8Array(Math.floor((value.length * 6) / 8));
  let word = 0;
  let bits = 0;
  let offset = 0;
  for (const char of value) {
    word = (word << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result[offset++] = (word >>> bits) & 255;
    }
    word &= (1 << bits) - 1;
  }
  if (word) throw new Error('invalid_pairing');
  return result;
}
export function parsePairing(raw: string, development = false): Pairing {
  if (raw.length > 6000) throw new Error('invalid_pairing');
  const p = JSON.parse(raw) as Pairing;
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (
    !p ||
    p.v !== 1 ||
    !uuid.test(p.hostId) ||
    !uuid.test(p.deviceId) ||
    typeof p.master !== 'string' ||
    p.master.length !== 43 ||
    fromBase64(p.master).length !== 32
  )
    throw new Error('invalid_pairing');
  const url = new URL(p.url);
  const local =
    development &&
    url.protocol === 'ws:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (!local && url.protocol !== 'wss:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('invalid_pairing');
  return {
    v: 1,
    url: url.origin,
    hostId: p.hostId,
    deviceId: p.deviceId,
    master: p.master,
  };
}
function derive(p: Pairing, info: string): Uint8Array {
  return hkdf(
    sha256,
    fromBase64(p.master),
    encoder.encode(`${p.hostId}:${p.deviceId}`),
    encoder.encode(info),
    32,
  );
}
export function auth(p: Pairing): string {
  return toBase64(derive(p, 'superior-relay-auth-v1'));
}
function aad(
  p: Pairing,
  direction: 'phone-to-host' | 'host-to-phone',
): Uint8Array {
  return encoder.encode(`superior:v1:${p.hostId}:${p.deviceId}:${direction}`);
}
export function encrypt(p: Pairing, value: object, nonce: Uint8Array): string {
  if (nonce.length !== 12) throw new Error('invalid_nonce');
  const sealed = gcm(
    derive(p, 'superior-mobile-e2ee-v1'),
    nonce,
    aad(p, 'phone-to-host'),
  ).encrypt(encoder.encode(JSON.stringify(value)));
  // Noble appends the tag; the existing desktop protocol puts it before ciphertext.
  const packet = new Uint8Array(12 + sealed.length);
  packet.set(nonce);
  packet.set(sealed.subarray(-16), 12);
  packet.set(sealed.subarray(0, -16), 28);
  return toBase64(packet);
}
export function decrypt(p: Pairing, packet: string): Record<string, unknown> {
  if (packet.length > 180000) throw new Error('invalid_packet');
  const bytes = fromBase64(packet);
  if (bytes.length < 29) throw new Error('invalid_packet');
  const sealed = new Uint8Array(bytes.length - 12);
  sealed.set(bytes.subarray(28));
  sealed.set(bytes.subarray(12, 28), bytes.length - 28);
  const plain = gcm(
    derive(p, 'superior-mobile-e2ee-v1'),
    bytes.subarray(0, 12),
    aad(p, 'host-to-phone'),
  ).decrypt(sealed);
  const value: unknown = JSON.parse(decoder.decode(plain));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_packet');
  return value as Record<string, unknown>;
}
export function inputChunks(value: string): string[] {
  const chunks: string[] = [];
  let part = '';
  let bytes = 0;
  for (const char of value) {
    const count = encoder.encode(char).length;
    if (bytes + count > 8192) {
      chunks.push(part);
      part = '';
      bytes = 0;
    }
    part += char;
    bytes += count;
  }
  if (part) chunks.push(part);
  return chunks;
}
