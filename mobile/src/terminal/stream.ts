import type { TerminalPacket } from '../relay/client';
/** Reject missing/reordered chunks instead of showing a corrupted terminal. */
export class TerminalStream {
  private next = 0;
  private snapshot = false;
  private part = 0;
  private ready = false;
  private bytes = 0;
  reset(): void {
    this.next = 0;
    this.snapshot = false;
    this.part = 0;
    this.ready = false;
    this.bytes = 0;
  }
  accept(packet: TerminalPacket): { reset: boolean; data: string } {
    if (
      !Number.isSafeInteger(packet.seq) ||
      !Number.isSafeInteger(packet.part) ||
      typeof packet.last !== 'boolean' ||
      typeof packet.data !== 'string'
    )
      throw new Error('invalid_stream');
    const snapshotStart =
      packet.type === 'terminal.snapshot' && packet.part === 0;
    if (snapshotStart) {
      this.reset();
      this.snapshot = true;
    }
    if (
      packet.seq !== this.next ||
      (!this.ready && !this.snapshot) ||
      packet.part !== this.part ||
      (this.snapshot && packet.type !== 'terminal.snapshot')
    )
      throw new Error('stream_gap');
    this.next++;
    this.part = packet.last ? 0 : this.part + 1;
    this.bytes += new TextEncoder().encode(packet.data).length;
    if (this.snapshot && this.bytes > 2_000_000)
      throw new Error('snapshot_too_large');
    if (this.snapshot && packet.last) {
      this.snapshot = false;
      this.ready = true;
    }
    return { reset: snapshotStart, data: packet.data };
  }
}
