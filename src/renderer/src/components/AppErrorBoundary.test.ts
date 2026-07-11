import { describe, expect, it } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

describe('AppErrorBoundary', () => {
  it('switches to its recovery fallback after a render failure', () => {
    expect(AppErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const boundary = new AppErrorBoundary({ children: 'healthy' })
    expect(boundary.render()).toBe('healthy')
    boundary.state = { failed: true }
    expect(boundary.render()).not.toBe('healthy')
  })
})
