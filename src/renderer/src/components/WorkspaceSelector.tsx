import type { Workspace } from '../types'

interface Props {
  workspace: Workspace | null
  onOpen: () => void
}

export function WorkspaceSelector({ workspace, onOpen }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onOpen}
        className="rounded-md bg-edge px-3 py-1.5 text-sm font-medium text-[#cdd6f4] transition hover:bg-[#45475a]"
      >
        Open from folder
      </button>
      {workspace && (
        <span className="font-mono text-xs text-[#a6adc8]" title={workspace.path}>
          {workspace.name}
        </span>
      )}
    </div>
  )
}
