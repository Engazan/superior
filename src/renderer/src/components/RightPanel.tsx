import { useState } from 'react'
import { ChangesView } from './ChangesView'
import { FilesView } from './FilesView'
import { useI18n } from '../i18n'

type Tab = 'files' | 'changes'

interface Props {
  /** Folder backing the active workspace, or null when none is selected. */
  folderPath: string | null
}

/**
 * Right-hand panel toggled from the title bar. Hosts the Files and Changes
 * tabs; only Changes (a working-tree diff) is implemented for now.
 */
export function RightPanel({ folderPath }: Props): JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('changes')

  const tabClass = (active: boolean): string =>
    `flex-1 px-3 py-2 text-xs font-medium transition border-b-2 ${
      active
        ? 'border-accent text-fg'
        : 'border-transparent text-fgmuted hover:text-fg'
    }`

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-edge bg-bar">
      <div className="flex shrink-0 border-b border-edge">
        <button className={tabClass(tab === 'files')} onClick={() => setTab('files')}>
          {t('rightPanel.files')}
        </button>
        <button className={tabClass(tab === 'changes')} onClick={() => setTab('changes')}>
          {t('rightPanel.changes')}
        </button>
      </div>

      {tab === 'changes' ? (
        <ChangesView folderPath={folderPath} />
      ) : (
        <FilesView folderPath={folderPath} />
      )}
    </aside>
  )
}
