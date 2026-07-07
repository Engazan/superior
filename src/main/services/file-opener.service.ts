import { execFile } from 'child_process'
import { shell } from 'electron'
import type { FileLinkTarget, FileOpener } from '@shared/types'
import { getSettings } from './settings.service'

const isWindows = process.platform === 'win32'

/**
 * Open a resolved terminal file link in the user's configured editor.
 *
 * URL-scheme editors (VS Code, Cursor, Zed) are launched via their protocol
 * handlers — the reliable channel from a GUI app, since their CLI shims often
 * aren't on the app's PATH. Sublime and the JetBrains IDEs have no universal
 * scheme, so their CLI runs through the user's login shell (same trick the
 * CLI-tools health check uses). 'system' defers to the OS default app.
 */
export async function openFileTarget(target: FileLinkTarget): Promise<{ ok: boolean; error?: string }> {
  const opener = getSettings().fileOpener
  try {
    switch (opener) {
      case 'system': {
        const error = await shell.openPath(target.path)
        return error ? { ok: false, error } : { ok: true }
      }
      case 'vscode':
        return openViaScheme('vscode', target)
      case 'cursor':
        return openViaScheme('cursor', target)
      case 'zed':
        return openViaScheme('zed', target)
      case 'sublime':
        return runInLoginShell(`subl ${quote(withPosition(target, ':'))}`, opener)
      case 'phpstorm':
      case 'webstorm':
        return runInLoginShell(
          target.line !== undefined
            ? `${opener} --line ${target.line} ${quote(target.path)}`
            : `${opener} ${quote(target.path)}`,
          opener
        )
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** `path:line:col` (or `path:line`) suffix form understood by subl/code CLIs. */
function withPosition(target: FileLinkTarget, sepChar: string): string {
  let out = target.path
  if (target.line !== undefined) {
    out += `${sepChar}${target.line}`
    if (target.column !== undefined) out += `${sepChar}${target.column}`
  }
  return out
}

async function openViaScheme(
  schemeName: 'vscode' | 'cursor' | 'zed',
  target: FileLinkTarget
): Promise<{ ok: boolean; error?: string }> {
  // vscode://file/<abs path>:<line>:<col> — Cursor and Zed mirror the shape.
  const posix = target.path.split('\\').join('/')
  const url = `${schemeName}://file/${encodeURI(posix.replace(/^\//, ''))}${
    target.line !== undefined
      ? `:${target.line}${target.column !== undefined ? `:${target.column}` : ''}`
      : ''
  }`
  await shell.openExternal(url)
  return { ok: true }
}

function quote(text: string): string {
  if (isWindows) return `"${text.replace(/"/g, '""')}"`
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** Run an editor CLI through the login shell so user PATH additions apply. */
function runInLoginShell(command: string, editor: FileOpener): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolvePromise) => {
    if (isWindows) {
      const comspec = process.env.COMSPEC || 'cmd.exe'
      execFile(comspec, ['/d', '/s', '/c', command], { timeout: 10_000 }, (err) => {
        resolvePromise(err ? { ok: false, error: `${editor}: ${err.message}` } : { ok: true })
      })
      return
    }
    const loginShell = process.env.SHELL || '/bin/bash'
    execFile(loginShell, ['-l', '-c', command], { timeout: 10_000 }, (err) => {
      resolvePromise(err ? { ok: false, error: `${editor}: ${err.message}` } : { ok: true })
    })
  })
}
