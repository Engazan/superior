/**
 * A byte-capped scrollback buffer. Appends raw PTY output (UTF-8 strings) and,
 * when over capacity, drops whole chunks from the front. Replaying the retained
 * bytes into a fresh xterm reproduces the screen (a TUI repaints on resize).
 */
export class RingBuffer {
  // Evicted entries are nulled and skipped via `head` — `shift()` reindexes the
  // whole array and would make sustained output O(n²).
  private chunks: Array<{ data: string; bytes: number } | null> = []
  private head = 0
  private size = 0

  constructor(private readonly capacity: number) {}

  push(data: string): void {
    const bytes = Buffer.byteLength(data)
    this.chunks.push({ data, bytes })
    this.size += bytes
    while (this.size > this.capacity && this.chunks.length - this.head > 1) {
      const dropped = this.chunks[this.head]!
      this.chunks[this.head] = null
      this.head++
      this.size -= dropped.bytes
    }
    // Compact once the dead prefix dominates, so memory stays bounded.
    if (this.head > 256 && this.head * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
  }

  /** The retained scrollback as a single string. */
  snapshot(): string {
    let out = ''
    for (let i = this.head; i < this.chunks.length; i++) out += this.chunks[i]!.data
    return out
  }

  clear(): void {
    this.chunks = []
    this.head = 0
    this.size = 0
  }
}
