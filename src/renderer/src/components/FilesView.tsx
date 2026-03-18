import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import type { FsEntry } from '../types'

interface Props {
  /** Folder backing the active workspace, or null when none is selected. */
  folderPath: string | null
  /** Called when a file (not a directory) is clicked, to open its preview. */
  onOpenFile: (file: FsEntry) => void
  /** Path of the file currently shown in the preview, for highlighting. */
  selectedPath: string | null
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      className={`block h-3 w-3 shrink-0 text-fgmuted transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0 text-sky-500"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.75 4.25h4l1.5 1.75h7v6.25a1 1 0 0 1-1 1H1.75a1 1 0 0 1-1-1V4.25Z" />
    </svg>
  )
}

function FileIcon(): JSX.Element {
  return (
    <svg
      className="block h-3.5 w-3.5 shrink-0 text-fgmuted"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V5.5L9 1.75Z" />
      <path d="M9 1.75V5.5h3.75" />
    </svg>
  )
}

interface NodeProps {
  entry: FsEntry
  depth: number
  onOpenFile: (file: FsEntry) => void
  selectedPath: string | null
}

/** A single tree row; directories fetch their children lazily on first expand. */
function TreeNode({ entry, depth, onOpenFile, selectedPath }: NodeProps): JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FsEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const activate = async (): Promise<void> => {
    if (!entry.isDirectory) {
      onOpenFile(entry)
      return
    }
    const next = !open
    setOpen(next)
    if (next && children === null) {
      setLoading(true)
      const res = await window.api.listDir(entry.path)
      setChildren(res.entries)
      setLoading(false)
    }
  }

  const selected = !entry.isDirectory && entry.path === selectedPath

  return (
    <div>
      <button
        onClick={() => void activate()}
        title={entry.name}
        className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition hover:bg-hover hover:text-fg ${
          selected ? 'bg-accentBg text-accent' : 'text-fgdim'
        }`}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {entry.isDirectory ? <Chevron open={open} /> : <span className="w-3 shrink-0" />}
        {entry.isDirectory ? <FolderIcon /> : <FileIcon />}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      </button>

      {open &&
        (loading && children === null ? (
          <div className="py-1 text-[11px] text-fgmuted" style={{ paddingLeft: (depth + 1) * 12 + 8 }}>
            {t('files.loading')}
          </div>
        ) : children && children.length === 0 ? (
          <div className="py-1 text-[11px] text-fgmuted" style={{ paddingLeft: (depth + 1) * 12 + 8 }}>
            {t('files.empty')}
          </div>
        ) : (
          children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />
          ))
        ))}
    </div>
  )
}

/** Flat result row for a search hit, showing the file name + its folder. */
function SearchRow({
  entry,
  rootPath,
  selected,
  onOpenFile
}: {
  entry: FsEntry
  rootPath: string
  selected: boolean
  onOpenFile: (file: FsEntry) => void
}): JSX.Element {
  const rel = entry.path.startsWith(rootPath) ? entry.path.slice(rootPath.length + 1) : entry.path
  const dir = rel.slice(0, rel.length - entry.name.length).replace(/\/$/, '')
  return (
    <button
      onClick={() => onOpenFile(entry)}
      title={rel}
      className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition hover:bg-hover hover:text-fg ${
        selected ? 'bg-accentBg text-accent' : 'text-fgdim'
      }`}
    >
      <FileIcon />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-fg">{entry.name}</span>
        {dir && <span className="text-fgmuted"> {dir}</span>}
      </span>
    </button>
  )
}

export function FilesView({ folderPath, onOpenFile, selectedPath }: Props): JSX.Element {
  const { t } = useI18n()
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FsEntry[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [truncated, setTruncated] = useState(false)

  // Load the root tree level; clear the query when switching folders.
  useEffect(() => {
    let active = true
    setEntries(null)
    setQuery('')
    if (!folderPath) return
    setLoading(true)
    window.api.listDir(folderPath).then((res) => {
      if (!active) return
      setEntries(res.entries)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [folderPath])

  // Debounced recursive search; empty query falls back to the tree.
  useEffect(() => {
    const q = query.trim()
    if (!folderPath || !q) {
      setResults(null)
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const id = window.setTimeout(() => {
      window.api
        .searchFiles(folderPath, q)
        .then((res) => {
          if (!active) return
          setResults(res.entries)
          setTruncated(res.truncated === true)
          setSearching(false)
        })
        .catch((err) => {
          if (!active) return
          console.error('[search] failed:', err)
          setResults([])
          setTruncated(false)
          setSearching(false)
        })
    }, 200)
    return () => {
      active = false
      window.clearTimeout(id)
    }
  }, [query, folderPath])

  if (!folderPath) {
    return <div className="px-3 py-4 text-xs text-fgmuted">{t('files.noFolder')}</div>
  }

  const searchActive = query.trim().length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-edge p-2">
        <div className="flex items-center gap-1.5 rounded border border-edge bg-panel px-2 py-1">
          <svg className="h-3.5 w-3.5 shrink-0 text-fgmuted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('files.search')}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg placeholder:text-fgmuted focus:outline-none"
          />
          {searchActive && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('window.close')}
              className="shrink-0 text-fgmuted transition hover:text-fg"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {searchActive ? (
        searching && results === null ? (
          <div className="px-3 py-4 text-xs text-fgmuted">{t('files.searching')}</div>
        ) : results && results.length === 0 ? (
          <div className="px-3 py-4 text-xs text-fgmuted">{t('files.noResults')}</div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {results?.map((entry) => (
              <SearchRow
                key={entry.path}
                entry={entry}
                rootPath={folderPath}
                selected={entry.path === selectedPath}
                onOpenFile={onOpenFile}
              />
            ))}
            {truncated && (
              <div className="px-3 py-1.5 text-[11px] text-fgmuted">{t('files.searchTruncated')}</div>
            )}
          </div>
        )
      ) : loading && entries === null ? (
        <div className="px-3 py-4 text-xs text-fgmuted">{t('files.loading')}</div>
      ) : entries && entries.length === 0 ? (
        <div className="px-3 py-4 text-xs text-fgmuted">{t('files.empty')}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {entries?.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}
