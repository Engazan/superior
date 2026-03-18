import type { GitDiffFile, GitDiffHunk } from '@shared/types'

/** Parse a unified `git diff` into structured per-file hunks. */
export function parseUnifiedDiff(raw: string): GitDiffFile[] {
  const files: GitDiffFile[] = []
  // Drop only the trailing newline git appends, so the last line isn't a phantom.
  const lines = (raw.endsWith('\n') ? raw.slice(0, -1) : raw).split('\n')
  let current: GitDiffFile | null = null
  let oldNo = 0
  let newNo = 0
  let i = 0

  const flush = (): void => {
    if (current) files.push(current)
    current = null
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('diff --git')) {
      flush()
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      current = {
        path: m ? m[2] : '',
        oldPath: null,
        status: 'modified',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        hunks: []
      }
      i++
      continue
    }

    if (!current) {
      i++
      continue
    }

    if (line.startsWith('new file mode')) {
      current.status = 'added'
    } else if (line.startsWith('deleted file mode')) {
      current.status = 'deleted'
    } else if (line.startsWith('rename from ')) {
      current.oldPath = line.slice('rename from '.length)
      current.status = 'renamed'
    } else if (line.startsWith('rename to ')) {
      current.path = line.slice('rename to '.length)
      current.status = 'renamed'
    } else if (line.startsWith('Binary files')) {
      current.binary = true
      current.truncated = true
    } else if (line.startsWith('+++ ')) {
      const p = line.slice(4)
      if (p.startsWith('b/')) current.path = p.slice(2)
    } else if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldNo = m ? parseInt(m[1], 10) : 0
      newNo = m ? parseInt(m[2], 10) : 0
      const hunk: GitDiffHunk = { header: line, lines: [] }
      current.hunks.push(hunk)
      i++
      while (i < lines.length) {
        const hl = lines[i]
        if (hl.startsWith('diff --git') || hl.startsWith('@@')) break
        if (hl.startsWith('\\')) {
          i++
          continue // "\ No newline at end of file"
        }
        const tag = hl[0]
        const content = hl.slice(1)
        if (tag === '+') {
          hunk.lines.push({ type: 'add', content, oldLine: null, newLine: newNo++ })
          current.additions++
        } else if (tag === '-') {
          hunk.lines.push({ type: 'del', content, oldLine: oldNo++, newLine: null })
          current.deletions++
        } else if (tag === ' ') {
          hunk.lines.push({ type: 'context', content, oldLine: oldNo++, newLine: newNo++ })
        } else {
          break // not part of this hunk (e.g. trailing metadata)
        }
        i++
      }
      continue
    }
    i++
  }

  flush()
  return files
}
