import { describe, expect, it } from 'vitest'
import { ipcErrorInfo, ipcErrorMessage } from './ipcError'

describe('IPC error normalization', () => {
  it('unwraps Electron errors while preserving a stable error code', () => {
    const err = new Error(
      "Error invoking remote method 'tasks:save': Error: persistence-failed: Failed to persist tasks."
    )
    expect(ipcErrorInfo(err)).toEqual({
      code: 'persistence-failed',
      message: 'Failed to persist tasks.'
    })
    expect(ipcErrorMessage(err)).toBe('Failed to persist tasks.')
  })
})
