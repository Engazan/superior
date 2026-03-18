/**
 * A byte-capped scrollback buffer. Appends raw PTY output (UTF-8 strings) and,
 * when over capacity, drops whole chunks from the front. Replaying the retained
 * bytes into a fresh xterm reproduces the screen (a TUI repaints on resize).
 */
export class RingBuffer {
  private chunks: string[] = []
  private size = 0

  constructor(private readonly capacity: number) {}

  push(data: string): void {
    this.chunks.push(data)
    this.size += Buffer.byteLength(data)
    while (this.size > this.capacity && this.chunks.length > 1) {
      const dropped = this.chunks.shift() as string
      this.size -= Buffer.byteLength(dropped)
    }
  }

  /** The retained scrollback as a single string. */
  snapshot(): string {
    return this.chunks.join('')
  }

  clear(): void {
    this.chunks = []
    this.size = 0
  }
}
