import { describe, expect, it } from 'vitest'
import { fileLinkTargetToEntry } from './filePreview'

describe('fileLinkTargetToEntry', () => {
  it('creates the same file entry shape used by the sidebar preview', () => {
    expect(fileLinkTargetToEntry({ path: '/workspace/src/App.tsx', line: 42 })).toEqual({
      name: 'App.tsx',
      path: '/workspace/src/App.tsx',
      isDirectory: false
    })
  })

  it('extracts file names from Windows paths', () => {
    expect(fileLinkTargetToEntry({ path: 'C:\\workspace\\src\\App.tsx' }).name).toBe('App.tsx')
  })
})
