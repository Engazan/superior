import * as fs from 'fs'

/** Small synchronous logger for the standalone daemon with a hard byte cap. */
export class BoundedLog {
  private bytes = 0

  constructor(
    private readonly file: string | undefined,
    private readonly maxBytes: number
  ) {
    if (!file || maxBytes <= 0) return
    try {
      const size = fs.statSync(file).size
      if (size > maxBytes) fs.truncateSync(file)
      else this.bytes = size
    } catch {
      // The file is created lazily on the first message.
    }
  }

  write(message: string): void {
    if (!this.file || this.maxBytes <= 0) return
    try {
      const line = Buffer.from(`[${new Date().toISOString()}] ${message}\n`, 'utf8')
      if (line.length >= this.maxBytes) {
        const tail = line.subarray(line.length - this.maxBytes)
        fs.writeFileSync(this.file, tail)
        this.bytes = tail.length
        return
      }
      if (this.bytes + line.length > this.maxBytes) {
        fs.writeFileSync(this.file, line)
        this.bytes = line.length
        return
      }
      fs.appendFileSync(this.file, line)
      this.bytes += line.length
    } catch {
      // Diagnostics must never take the PTY owner down.
    }
  }
}
