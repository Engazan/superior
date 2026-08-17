interface IconProps {
  name: string
  size?: number
  className?: string
}

interface FolderIconProps extends IconProps {
  open?: boolean
}

export interface EntryIconDescriptor {
  label: string | null
  color: string
}

const COLORS = {
  blue: '#6b9ed6',
  cyan: '#55aebb',
  green: '#62ad82',
  muted: 'var(--c-fgmuted)',
  orange: '#d9825b',
  pink: '#c779a0',
  purple: '#9a82cf',
  red: '#cf6f72',
  yellow: '#c9a64f'
} as const

const TYPES: Readonly<Record<string, EntryIconDescriptor>> = {
  // Web
  js: { label: 'JS', color: COLORS.yellow },
  jsx: { label: 'JS', color: COLORS.yellow },
  mjs: { label: 'JS', color: COLORS.yellow },
  cjs: { label: 'JS', color: COLORS.yellow },
  ts: { label: 'TS', color: COLORS.blue },
  tsx: { label: 'TS', color: COLORS.blue },
  mts: { label: 'TS', color: COLORS.blue },
  cts: { label: 'TS', color: COLORS.blue },
  html: { label: '<>', color: COLORS.orange },
  htm: { label: '<>', color: COLORS.orange },
  css: { label: '#', color: COLORS.blue },
  scss: { label: 'SC', color: COLORS.pink },
  sass: { label: 'SA', color: COLORS.pink },
  less: { label: 'LS', color: COLORS.blue },
  styl: { label: 'ST', color: COLORS.green },
  vue: { label: 'V', color: COLORS.green },
  svelte: { label: 'S', color: COLORS.orange },
  astro: { label: 'A', color: COLORS.purple },

  // Application languages
  php: { label: 'PHP', color: COLORS.purple },
  py: { label: 'PY', color: COLORS.blue },
  pyw: { label: 'PY', color: COLORS.blue },
  rb: { label: 'RB', color: COLORS.red },
  go: { label: 'GO', color: COLORS.cyan },
  rs: { label: 'RS', color: COLORS.orange },
  java: { label: 'JV', color: COLORS.red },
  kt: { label: 'KT', color: COLORS.purple },
  kts: { label: 'KT', color: COLORS.purple },
  swift: { label: 'SW', color: COLORS.orange },
  dart: { label: 'DT', color: COLORS.cyan },
  scala: { label: 'SC', color: COLORS.red },
  c: { label: 'C', color: COLORS.blue },
  h: { label: 'C', color: COLORS.blue },
  cc: { label: 'C+', color: COLORS.blue },
  cpp: { label: 'C+', color: COLORS.blue },
  hpp: { label: 'C+', color: COLORS.blue },
  cs: { label: 'C#', color: COLORS.green },
  lua: { label: 'LU', color: COLORS.blue },
  pl: { label: 'PL', color: COLORS.cyan },
  r: { label: 'R', color: COLORS.blue },

  // Data, config and documentation
  json: { label: '{}', color: COLORS.yellow },
  jsonc: { label: '{}', color: COLORS.yellow },
  json5: { label: '{}', color: COLORS.yellow },
  yaml: { label: 'Y', color: COLORS.red },
  yml: { label: 'Y', color: COLORS.red },
  toml: { label: 'T', color: COLORS.orange },
  xml: { label: '<>', color: COLORS.purple },
  sql: { label: 'DB', color: COLORS.cyan },
  graphql: { label: 'GQL', color: COLORS.pink },
  gql: { label: 'GQL', color: COLORS.pink },
  proto: { label: 'PB', color: COLORS.green },
  md: { label: 'MD', color: COLORS.blue },
  markdown: { label: 'MD', color: COLORS.blue },
  mdx: { label: 'MD', color: COLORS.blue },
  ini: { label: 'CF', color: COLORS.muted },
  cfg: { label: 'CF', color: COLORS.muted },
  conf: { label: 'CF', color: COLORS.muted },
  env: { label: 'ENV', color: COLORS.yellow },
  properties: { label: 'CF', color: COLORS.muted },

  // Shell, assets and other common project files
  sh: { label: '>_', color: COLORS.green },
  bash: { label: '>_', color: COLORS.green },
  zsh: { label: '>_', color: COLORS.green },
  fish: { label: '>_', color: COLORS.green },
  ps1: { label: '>_', color: COLORS.blue },
  bat: { label: '>_', color: COLORS.green },
  cmd: { label: '>_', color: COLORS.green },
  diff: { label: '±', color: COLORS.green },
  patch: { label: '±', color: COLORS.green },
  lock: { label: 'LK', color: COLORS.yellow },
  log: { label: 'LOG', color: COLORS.muted },
  txt: { label: 'TXT', color: COLORS.muted },
  csv: { label: 'CSV', color: COLORS.green },
  tsv: { label: 'TSV', color: COLORS.green },
  pdf: { label: 'PDF', color: COLORS.red },
  png: { label: 'IMG', color: COLORS.pink },
  jpg: { label: 'IMG', color: COLORS.pink },
  jpeg: { label: 'IMG', color: COLORS.pink },
  gif: { label: 'IMG', color: COLORS.pink },
  webp: { label: 'IMG', color: COLORS.pink },
  svg: { label: 'SVG', color: COLORS.orange },
  ico: { label: 'ICO', color: COLORS.pink }
}

function extension(name: string): string {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot < 1 ? '' : lower.slice(dot + 1)
}

/** Resolve exact project filenames before falling back to their extension. */
export function getFileIconDescriptor(name: string): EntryIconDescriptor {
  const lower = name.toLowerCase()

  if (lower === 'package.json' || lower === 'package-lock.json' || lower === 'npm-shrinkwrap.json') {
    return { label: 'NPM', color: COLORS.red }
  }
  if (lower === 'yarn.lock') return { label: 'Y', color: COLORS.blue }
  if (lower === 'pnpm-lock.yaml') return { label: 'PN', color: COLORS.orange }
  if (lower === 'bun.lock' || lower === 'bun.lockb') return { label: 'B', color: COLORS.orange }
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower.startsWith('docker-compose.')) {
    return { label: 'DK', color: COLORS.cyan }
  }
  if (lower === 'makefile' || lower.startsWith('makefile.')) return { label: 'MK', color: COLORS.green }
  if (lower.startsWith('.git')) return { label: 'GIT', color: COLORS.orange }
  if (lower === '.env' || lower.startsWith('.env.')) return { label: 'ENV', color: COLORS.yellow }
  if (lower.startsWith('readme')) return { label: 'RD', color: COLORS.blue }
  if (lower.startsWith('license') || lower.startsWith('licence')) return { label: 'LIC', color: COLORS.yellow }
  if (lower.startsWith('changelog')) return { label: 'LOG', color: COLORS.purple }
  if (lower === 'agents.md') return { label: 'AI', color: COLORS.purple }
  if (lower.startsWith('tsconfig') && lower.endsWith('.json')) return { label: 'TS', color: COLORS.blue }
  if (lower === '.editorconfig') return { label: 'CF', color: COLORS.muted }

  const ext = extension(lower)
  if (TYPES[ext]) return TYPES[ext]
  if (ext && ext.length <= 4) return { label: ext.slice(0, 3).toUpperCase(), color: COLORS.muted }
  return { label: null, color: COLORS.muted }
}

export function getFolderIconDescriptor(name: string): EntryIconDescriptor {
  const lower = name.toLowerCase()
  if (['src', 'source', 'app', 'lib'].includes(lower)) return { label: '<>', color: COLORS.blue }
  if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(lower)) return { label: '✓', color: COLORS.green }
  if (['assets', 'images', 'img', 'icons', 'public', 'static'].includes(lower)) {
    return { label: '◇', color: COLORS.pink }
  }
  if (['docs', 'doc', 'documentation'].includes(lower)) return { label: 'i', color: COLORS.cyan }
  if (['dist', 'build', 'out', 'target'].includes(lower)) return { label: '↑', color: COLORS.yellow }
  if (['node_modules', 'vendor', 'packages'].includes(lower)) return { label: '□', color: COLORS.green }
  if (['database', 'db', 'migrations'].includes(lower)) return { label: 'DB', color: COLORS.cyan }
  if (['config', 'configs', '.config', '.github', '.vscode'].includes(lower)) {
    return { label: '•', color: COLORS.purple }
  }
  return { label: null, color: 'var(--c-accent)' }
}

function labelSize(label: string): number {
  if (label.length >= 3) return 4.2
  if (label.length === 2) return 5.2
  return 6.2
}

export function FileTypeIcon({ name, size = 14, className }: IconProps): React.JSX.Element {
  const descriptor = getFileIconDescriptor(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={`block shrink-0 ${className ?? ''}`}
      style={{ color: descriptor.color }}
      aria-hidden
    >
      <path d="M3 1.5h6.25L13 5.25v9.25H3z" fill="currentColor" opacity="0.11" />
      <path
        d="M3 1.5h6.25L13 5.25v9.25H3zM9.25 1.5v3.75H13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {descriptor.label && (
        <text
          x="8"
          y="11.65"
          fill="currentColor"
          stroke="none"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={labelSize(descriptor.label)}
          fontWeight="750"
          letterSpacing="-0.25"
        >
          {descriptor.label}
        </text>
      )}
    </svg>
  )
}

export function FolderTypeIcon({ name, open = false, size = 14, className }: FolderIconProps): React.JSX.Element {
  const descriptor = getFolderIconDescriptor(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={`block shrink-0 ${className ?? ''}`}
      style={{ color: descriptor.color }}
      aria-hidden
    >
      <path
        d={open ? 'M1.5 5h13l-1.2 8H2.7z' : 'M1.5 3.25h4l1.4 1.6h7.6V13H1.5z'}
        fill="currentColor"
        opacity={open ? 0.2 : 0.13}
      />
      <path
        d={open ? 'M1.5 5h13l-1.2 8H2.7L1.5 5Zm0 0V3.25h4l1.4 1.6h6.5' : 'M1.5 3.25h4l1.4 1.6h7.6V13H1.5V3.25Z'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {descriptor.label && (
        <text
          x="8"
          y="10.75"
          fill="currentColor"
          stroke="none"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={labelSize(descriptor.label)}
          fontWeight="750"
          letterSpacing="-0.25"
        >
          {descriptor.label}
        </text>
      )}
    </svg>
  )
}
