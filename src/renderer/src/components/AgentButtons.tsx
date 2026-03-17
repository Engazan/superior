import type { AgentType } from '../types'

interface Props {
  disabled: boolean
  onLaunch: (agent: AgentType) => void
}

const base =
  'rounded-md px-3 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40'

export function AgentButtons({ disabled, onLaunch }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={disabled}
        onClick={() => onLaunch('claude')}
        className={`${base} bg-orange-600 hover:bg-orange-500`}
        title={disabled ? 'Open a workspace first' : 'Run the claude CLI in this folder'}
      >
        Open Claude
      </button>
      <button
        disabled={disabled}
        onClick={() => onLaunch('codex')}
        className={`${base} bg-emerald-600 hover:bg-emerald-500`}
        title={disabled ? 'Open a workspace first' : 'Run the codex CLI in this folder'}
      >
        Open Codex
      </button>
    </div>
  )
}
