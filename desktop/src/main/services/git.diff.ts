import type { GitDiffFile, GitDiffHunk } from '@shared/types'

/**
 * Decode a git C-quoted path (`"\303\241.txt"` → `á.txt`). Octal escapes are
 * UTF-8 bytes. Git quotes paths containing quotes, backslashes or control
 * bytes even with core.quotePath disabled, so the parser must always be ready
 * for both forms. Unquoted input passes through unchanged.
 */
export function unquoteGitPath(p: string): string {
  if (p.length < 2 || !p.startsWith('"') || !p.endsWith('"')) return p
  const inner = p.slice(1, -1)
  const bytes: number[] = []
  const pushStr = (s: string): void => {
    for (const b of Buffer.from(s, 'utf8')) bytes.push(b)
  }
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] !== '\\') {
      let j = i
      while (j < inner.length && inner[j] !== '\\') j++
      pushStr(inner.slice(i, j))
      i = j - 1
      continue
    }
    const next = inner[i + 1]
    if (next >= '0' && next <= '7') {
      bytes.push(parseInt(inner.slice(i + 1, i + 4), 8))
      i += 3
    } else {
      const simple: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        b: '\b',
        f: '\f',
        v: '\v',
        a: '\x07'
      }
      pushStr(simple[next] ?? next) // '"' and '\' decode to themselves
      i += 1
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/**
 * The new-side path from a `diff --git a/X b/Y` header. A quoted b-side is
 * unambiguous. Unquoted headers are ambiguous for paths containing ` b/`;
 * since X === Y for everything but renames (whose explicit `rename from/to`
 * lines override this guess anyway), prefer the split where both sides agree.
 */
function parseDiffGitPath(line: string): string {
  const rest = line.slice('diff --git '.length)
  const quoted = rest.match(/ "b\/((?:[^"\\]|\\.)*)"$/)
  if (quoted) return unquoteGitPath(`"${quoted[1]}"`)
  const candidates: string[] = []
  for (let i = rest.indexOf(' b/'); i !== -1; i = rest.indexOf(' b/', i + 1)) {
    candidates.push(rest.slice(i + 3))
  }
  for (const cand of candidates) {
    if (rest === `a/${cand} b/${cand}`) return cand
  }
  return candidates.length ? candidates[candidates.length - 1] : ''
}

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
      current = {
        path: parseDiffGitPath(line),
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
      current.oldPath = unquoteGitPath(line.slice('rename from '.length))
      current.status = 'renamed'
    } else if (line.startsWith('rename to ')) {
      current.path = unquoteGitPath(line.slice('rename to '.length))
      current.status = 'renamed'
    } else if (line.startsWith('Binary files')) {
      current.binary = true
      current.truncated = true
    } else if (line.startsWith('+++ ')) {
      // Unquoted paths containing spaces get a disambiguating trailing tab;
      // a name really ending in a tab would arrive quoted, so stripping is safe.
      const p = unquoteGitPath(line.slice(4).replace(/\t$/, ''))
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
