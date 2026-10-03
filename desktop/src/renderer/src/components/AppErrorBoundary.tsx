import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/** Last-resort containment for render/lifecycle failures in the renderer tree. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] unrecoverable render failure:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid h-screen place-items-center bg-base p-6 text-fg">
        <div className="max-w-md rounded-xl border border-edge bg-panel p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold">Superior could not render this window.</h1>
          <p className="mt-2 text-sm text-fgmuted">
            Running terminal sessions remain in the background. Reload the window to reconnect.
          </p>
          <button
            className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Reload window
          </button>
        </div>
      </main>
    )
  }
}
