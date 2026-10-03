import { useEffect, useState, type DragEvent } from 'react'
import { PresetIcon } from './PresetIcon'
import { PresetForm } from './PresetForm'
import {
  Button,
  GripIcon,
  IconButton,
  PencilIcon,
  PlusIcon,
  EmptyState,
  SectionHeader,
  Toggle,
  TrashIcon,
  useConfirm,
  useToast
} from './ui'
import { CustomMemoryPresets } from './CustomMemoryPresets'
import { CliToolsHealth } from './CliToolsHealth'
import { useI18n } from '../i18n'
import type { PresetsState, TerminalPreset } from '../types'

interface Props {
  presets: TerminalPreset[]
  onSave: (preset: TerminalPreset) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onToggleActive: (id: string, active: boolean) => void
  onPickImage: () => Promise<{ dataUrl: string } | null>
  onPresetsChanged: (state: PresetsState) => void
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

export function PresetsSection({
  presets,
  onSave,
  onDelete,
  onReorder,
  onToggleActive,
  onPickImage,
  onPresetsChanged
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState<TerminalPreset | 'new' | null>(null)
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

  const dragOverRow = (e: DragEvent<HTMLLIElement>, targetId: string): void => {
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

  // Keyboard alternative to the mouse-only drag grip.
  const moveBy = (id: string, direction: -1 | 1): void => {
    const ids = displayed.map((p) => p.id)
    const idx = ids.indexOf(id)
    const target = idx + direction
    if (idx === -1 || target < 0 || target >= ids.length) return
    const next = [...ids]
    next.splice(idx, 1)
    next.splice(target, 0, id)
    onReorder(next)
  }

  const removePreset = async (p: TerminalPreset): Promise<void> => {
    const ok = await confirm({
      title: t('presets.deleteTitle'),
      message: t('presets.deleteConfirm', { name: p.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger'
    })
    if (ok) {
      onDelete(p.id)
      toast.success(t('toast.presetDeleted', { name: p.name }))
    }
  }

  return (
    <div className="settings-section">
      <SectionHeader
        title={t('settings.terminalPresets')}
        actions={<Button onClick={() => setEditing('new')}><PlusIcon />{t('presets.add')}</Button>}
      />

      <div className="settings-island">
        {displayed.length === 0 ? <EmptyState title={t('presets.empty')} /> : (
          <ul className="divide-y divide-edge">
            {displayed.map((p) => (
              <li
                key={p.id}
                onDragOver={(e) => dragOverRow(e, p.id)}
                onDrop={(e) => e.preventDefault()}
                className={`settings-preset-row grid items-center gap-3 px-4 py-3 transition ${
                  dragId === p.id ? 'opacity-40' : 'hover:bg-bar/60'
                }`}
              >
                <button
                  type="button"
                  draggable
                  tabIndex={0}
                  onDragStart={(e) => {
                    startDrag(p.id)
                    // No floating ghost — just sort the rows in place.
                    e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={endDrag}
                  // Arrow keys reorder too — the drag grip alone is mouse-only.
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      moveBy(p.id, -1)
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      moveBy(p.id, 1)
                    }
                  }}
                  className="cursor-grab select-none rounded py-2 text-center text-fgmuted hover:text-fg active:cursor-grabbing focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
                  title={t('presets.dragReorder')}
                  aria-label={t('presets.dragReorder')}
                >
                  <span className="inline-flex justify-center">
                    <GripIcon />
                  </span>
                </button>
                <PresetIcon iconType={p.iconType} icon={p.icon} className="h-6 w-6 text-lg" />
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium text-fg">{p.name}</div>
                  {p.description && <p className="mt-0.5 text-xs leading-relaxed text-fgdim [overflow-wrap:anywhere]">{p.description}</p>}
                  <p title={p.command} className="mt-1 truncate font-mono text-[11px] text-fgmuted">{p.command}</p>
                </div>
                <div className="settings-preset-actions flex items-center justify-end gap-1">
                  <span className="mr-2"><Toggle checked={p.active} onChange={(checked) => onToggleActive(p.id, checked)} label={t('presets.markActive', { name: p.name })} /></span>
                    <IconButton
                      size="sm"
                      label={`${t('common.edit')} ${p.name}`}
                      title={t('common.edit')}
                      onClick={() => setEditing(p)}
                    >
                      <PencilIcon size={13} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="danger-ghost"
                      label={`${t('common.delete')} ${p.name}`}
                      title={t('common.delete')}
                      onClick={() => void removePreset(p)}
                    >
                      <TrashIcon size={13} />
                    </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CustomMemoryPresets onPresetsChanged={onPresetsChanged} />

      <CliToolsHealth />

      {editing !== null && (
        <PresetForm
          preset={editing === 'new' ? null : editing}
          onPickImage={onPickImage}
          onCancel={() => setEditing(null)}
          onSave={(preset) => {
            onSave(preset)
            setEditing(null)
            toast.success(t('toast.presetSaved', { name: preset.name }))
          }}
        />
      )}
    </div>
  )
}
