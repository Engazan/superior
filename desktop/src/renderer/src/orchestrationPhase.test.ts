import { describe, expect, it } from 'vitest'
import type { WorkerSummary } from '@shared/native-chat'
import { orchestrationPhases } from './orchestrationPhase'

const worker = (status: WorkerSummary['status']): WorkerSummary => ({ id: status, workspaceId: 'w', title: status, status, summary: '' })

describe('orchestrationPhases', () => {
  it('starts in split while the coordinator plans', () => {
    expect(orchestrationPhases({ status: 'working', workers: [] })).toEqual({ split: 'active', build: 'pending', review: 'pending', merge: 'pending' })
    expect(orchestrationPhases({ status: 'idle' }).split).toBe('pending')
  })

  it('builds while any worker is live, even if others finished', () => {
    expect(orchestrationPhases({ status: 'working', workers: [worker('idle'), worker('waiting')] }).build).toBe('active')
  })

  it('reviews once every worker finished and the coordinator still works', () => {
    expect(orchestrationPhases({ status: 'working', workers: [worker('idle'), worker('error')] })).toEqual({ split: 'done', build: 'done', review: 'active', merge: 'pending' })
  })

  it('hands merge to the user when the coordinator is done', () => {
    expect(orchestrationPhases({ status: 'idle', workers: [worker('idle')] }).merge).toBe('active')
  })
})
