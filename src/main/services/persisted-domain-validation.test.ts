import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ getPath: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: electron.getPath } }))

import { getTabs } from './layout.service'
import { listTasks } from './tasks.service'

describe('persisted domain validation', () => {
  let userData: string

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'superior-domain-store-'))
    electron.getPath.mockReturnValue(userData)
  })

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true })
    electron.getPath.mockReset()
  })

  it('drops malformed tasks while retaining valid tasks', () => {
    fs.writeFileSync(
      path.join(userData, 'tasks.json'),
      JSON.stringify({
        paused: true,
        tasks: [
          {
            id: 'task-1',
            folderPath: '/project',
            prompt: 'fix it',
            presetId: 'preset-1',
            useWorktree: false,
            status: 'queued',
            createdAt: 1
          },
          null,
          { id: 'broken', status: 'invented' }
        ]
      })
    )

    expect(listTasks()).toMatchObject({ paused: true, tasks: [{ id: 'task-1' }] })
  })

  it('drops malformed workspace tab entries', () => {
    fs.writeFileSync(
      path.join(userData, 'layouts.json'),
      JSON.stringify({
        good: { tabs: [{ id: 'tab-1', name: 'Tab 1' }], activeTabId: 'tab-1' },
        bad: { tabs: 'not-an-array', activeTabId: 42 }
      })
    )

    expect(getTabs()).toEqual({
      good: { tabs: [{ id: 'tab-1', name: 'Tab 1' }], activeTabId: 'tab-1' }
    })
  })
})
