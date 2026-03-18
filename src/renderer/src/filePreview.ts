import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import type { FsEntry } from './types'

/** Which preview surface a file should open in. */
export type FilePreviewType = 'code' | 'markdown' | 'json' | 'image' | 'pdf' | 'unsupported'

/** Read at most 1 MB of text; larger files show a warning instead. */
export const TEXT_MAX_BYTES = 1024 * 1024
/** Inline images only up to 10 MB; larger ones fall back to open-raw. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'])
const MARKDOWN_EXTS = new Set(['md', 'markdown', 'mdx'])
const JSON_EXTS = new Set(['json', 'jsonc', 'json5'])

// Extensions we treat as plain text / code (rendered in CodeMirror).
const TEXT_EXTS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'scala', 'sh', 'bash', 'zsh',
  'fish', 'ps1', 'bat', 'cmd', 'lua', 'pl', 'r', 'dart', 'html', 'htm', 'xml', 'svg', 'css',
  'scss', 'sass', 'less', 'styl', 'vue', 'svelte', 'astro', 'yml', 'yaml', 'toml', 'ini',
  'cfg', 'conf', 'env', 'properties', 'gitignore', 'gitattributes', 'dockerfile', 'editorconfig',
  'txt', 'text', 'log', 'csv', 'tsv', 'sql', 'graphql', 'gql', 'proto', 'tex', 'diff', 'patch'
])

// Extension-derived MIME, used alongside the binary sniff done in the main process.
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml', avif: 'image/avif',
  pdf: 'application/pdf', json: 'application/json', md: 'text/markdown', markdown: 'text/markdown',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', ts: 'text/typescript',
  txt: 'text/plain', csv: 'text/csv', xml: 'application/xml', yml: 'text/yaml', yaml: 'text/yaml'
}

/** Lower-case extension without the dot, or '' for dotfiles/extensionless names. */
function ext(file: FsEntry): string {
  const name = file.name.toLowerCase()
  // Treat dotfiles (.gitignore) and known extensionless names by their full name.
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name.replace(/^\./, '')
  return name.slice(dot + 1)
}

export function getFilePreviewType(file: FsEntry): FilePreviewType {
  const e = ext(file)
  if (IMAGE_EXTS.has(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  if (MARKDOWN_EXTS.has(e)) return 'markdown'
  if (JSON_EXTS.has(e)) return 'json'
  if (TEXT_EXTS.has(e) || file.name.toLowerCase() === 'dockerfile' || file.name.toLowerCase() === 'makefile') {
    return 'code'
  }
  return 'unsupported'
}

/** True for anything we'd render as text in CodeMirror (code / json / markdown). */
export function isTextFile(file: FsEntry): boolean {
  const type = getFilePreviewType(file)
  return type === 'code' || type === 'json' || type === 'markdown'
}

/** The CodeMirror language extension for a file, or null for plain text. */
export function getCodeMirrorLanguage(file: FsEntry): Extension | null {
  const e = ext(file)
  switch (e) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ jsx: true })
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'py':
      return python()
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
    case 'astro':
      return html()
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl':
      return css()
    case 'json':
    case 'jsonc':
    case 'json5':
      return json()
    case 'md':
    case 'markdown':
    case 'mdx':
      return markdown()
    default:
      return null
  }
}

export function guessMimeType(file: FsEntry): string {
  return MIME_BY_EXT[ext(file)] ?? 'application/octet-stream'
}

/** Human-readable byte size, e.g. "1.4 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}
