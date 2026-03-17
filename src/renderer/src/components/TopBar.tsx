import type { Workspace } from '../types'

interface Props {
  workspace: Workspace | null
}

export function TopBar({ workspace }: Props): JSX.Element {
  return (
    <header className="flex items-center justify-between border-b border-edge bg-bar px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm bg-gradient-to-br from-sky-400 to-indigo-500" />
        <h1 className="text-sm font-semibold tracking-wide text-[#cdd6f4]">Superior</h1>
      </div>
      <div className="max-w-[60%] truncate font-mono text-xs text-[#9399b2]" title={workspace?.path}>
        {workspace ? workspace.path : 'No workspace'}
      </div>
    </header>
  )
}
