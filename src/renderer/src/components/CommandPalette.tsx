import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { filterCommands, type Command } from '../commands'

interface Props {
  commands: Command[]
  onClose: () => void
}

/**
 * ⌘K command palette: fuzzy-search every currently available action —
 * workspaces, presets, prompts, panels, git — grouped by section, driven
 * entirely by the keyboard (↑↓ move, Enter runs, Escape closes).
 */
export function CommandPalette({ commands, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    setIndex(0)
  }, [query])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const run = (cmd: Command | undefined): void => {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  // Group rows by section, preserving rank order within each group.
  const grouped = useMemo(() => {
    const bySection = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const list = bySection.get(cmd.section) ?? []
      list.push(cmd)
      bySection.set(cmd.section, list)
    }
    return [...bySection.entries()]
  }, [filtered])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-24"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[26rem] w-[28rem] flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-xl"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(filtered[index])
            }
          }}
          placeholder={t('palette.placeholder')}
          className="border-b border-edge bg-transparent px-3 py-2.5 text-sm text-fg placeholder:text-fgmuted focus:outline-none"
        />

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-fgmuted">
              {t('palette.noResults')}
            </div>
          )}
          {grouped.map(([section, cmds]) => (
            <div key={section}>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-fgmuted">
                {section}
              </div>
              {cmds.map((cmd) => {
                const i = filtered.indexOf(cmd)
                return (
                  <button
                    key={cmd.id}
                    data-active={i === index || undefined}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => run(cmd)}
                    className={`block w-full truncate px-3 py-1.5 text-left text-sm text-fg transition ${
                      i === index ? 'bg-hover' : ''
                    }`}
                  >
                    {cmd.title}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
