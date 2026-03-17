import { useEffect, useState, type DragEvent } from 'react'
import { PresetIcon } from './PresetIcon'
import { PresetForm } from './PresetForm'
import { Toggle } from './Toggle'
import type { TerminalPreset } from '../types'

interface Props {
  presets: TerminalPreset[]
  onSave: (preset: TerminalPreset) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onToggleActive: (id: string, active: boolean) => void
  onPickImage: () => Promise<{ dataUrl: string } | null>
}

/** Place `fromId` before or after `toId` (controlled by `after`). */
function reorder(ids: string[], fromId: string, toId: string, after: boolean): string[] {
  if (fromId === toId) return ids
  const without = ids.filter((id) => id !== fromId)
  let toIdx = without.indexOf(toId)
  if (toIdx < 0) return ids
  if (after) toIdx += 1
  without.splice(toIdx, 0, fromId)
  return without
}

// A 1x1 transparent image used to suppress the native drag "ghost", so dragging
// the handle only re-sorts the rows in place rather than dragging a floating copy.
const TRANSPARENT_DRAG_IMAGE = new Image()
TRANSPARENT_DRAG_IMAGE.src =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function GripIcon(): JSX.Element {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="4" r="1.2" />
      <circle cx="7" cy="4" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="12" r="1.2" />
      <circle cx="7" cy="12" r="1.2" />
    </svg>
  )
}

export function PresetsSection({
  presets,
  onSave,
  onDelete,
  onReorder,
  onToggleActive,
  onPickImage
}: Props): JSX.Element {
  const [editing, setEditing] = useState<TerminalPreset | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TerminalPreset | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // A working order applied live while dragging; cleared once the prop catches up.
  const [order, setOrder] = useState<string[] | null>(null)

  // Whenever the persisted presets change, drop any stale working order.
  useEffect(() => setOrder(null), [presets])

  const displayed = order
    ? (order.map((id) => presets.find((p) => p.id === id)).filter(Boolean) as TerminalPreset[])
    : presets

  const startDrag = (id: string): void => {
    setDragId(id)
    setOrder(presets.map((p) => p.id))
  }

  const dragOverRow = (e: DragEvent<HTMLTableRowElement>, targetId: string): void => {
    e.preventDefault()
    if (!dragId || dragId === targetId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setOrder((prev) => {
      const ids = prev ?? presets.map((p) => p.id)
      const next = reorder(ids, dragId, targetId, after)
      return next.join(',') === ids.join(',') ? prev : next
    })
  }

  const endDrag = (): void => {
    setDragId(null)
    if (!order) return
    const changed = order.join(',') !== presets.map((p) => p.id).join(',')
    if (changed) onReorder(order)
    else setOrder(null)
  }

  return (
    <div className="relative h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">Terminal presets</h2>
        <button
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500"
          onClick={() => setEditing('new')}
        >
          Pridať preset
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-edge">
        <table className="w-full text-sm">
          <thead className="bg-bar text-left text-xs text-fgdim">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="w-10 px-2 py-2">Icon</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Command</th>
              <th className="w-16 px-2 py-2 text-center">Active</th>
              <th className="w-20 px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-fgmuted">
                  No presets yet — add one with “Pridať preset”.
                </td>
              </tr>
            ) : (
              displayed.map((p) => (
                <tr
                  key={p.id}
                  onDragOver={(e) => dragOverRow(e, p.id)}
                  onDrop={(e) => e.preventDefault()}
                  className={`border-t border-edge transition ${
                    dragId === p.id ? 'opacity-40' : 'hover:bg-bar/60'
                  }`}
                >
                  <td
                    draggable
                    onDragStart={(e) => {
                      startDrag(p.id)
                      // No floating ghost — just sort the rows in place.
                      e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={endDrag}
                    className="cursor-grab select-none px-2 py-2 text-center text-fgmuted hover:text-fg active:cursor-grabbing"
                    title="Drag to reorder"
                    aria-label="Drag to reorder"
                  >
                    <span className="inline-flex justify-center">
                      <GripIcon />
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <PresetIcon iconType={p.iconType} icon={p.icon} className="h-5 w-5 text-lg" />
                  </td>
                  <td className="px-2 py-2 font-medium text-fg">{p.name}</td>
                  <td className="px-2 py-2 text-fgdim">{p.description}</td>
                  <td className="px-2 py-2 font-mono text-xs text-fgdim">{p.command}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center">
                      <Toggle
                        checked={p.active}
                        onChange={(checked) => onToggleActive(p.id, checked)}
                        aria-label={`Mark ${p.name} active`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded p-1 text-fgdim hover:bg-hover hover:text-fg"
                        title="Edit"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                      >
                        ✎
                      </button>
                      <button
                        className="rounded p-1 text-fgdim hover:bg-hover hover:text-red-400"
                        title="Delete"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setConfirmDelete(p)}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <PresetForm
          preset={editing === 'new' ? null : editing}
          onPickImage={onPickImage}
          onCancel={() => setEditing(null)}
          onSave={(preset) => {
            onSave(preset)
            setEditing(null)
          }}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-edge bg-panel p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-fg">Delete preset</h3>
            <p className="mb-5 text-sm text-fgdim">
              Delete “{confirmDelete.name}”? This can’t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-fgdim hover:text-fg"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
                onClick={() => {
                  onDelete(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
