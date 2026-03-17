import type { Workspace } from '../types'

interface Props {
  activeWorkspace: Workspace | null
}

export function TopBar({ activeWorkspace }: Props): JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-edge bg-bar px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-gradient-to-br from-sky-400 to-indigo-500" />
        <h1 className="text-sm font-semibold tracking-wide text-fg">Superior</h1>
      </div>
      <div
        className="max-w-[60%] truncate font-mono text-xs text-fgdim"
        title={activeWorkspace?.path}
      >
        {activeWorkspace ? activeWorkspace.path : 'No workspace'}
      </div>
    </header>
  )
}
