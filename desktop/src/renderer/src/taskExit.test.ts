import { describe, expect, it } from 'vitest'
import { taskExitOutcome } from './taskExit'

describe('taskExitOutcome', () => {
  it('marks only an observed zero exit as done', () => {
    expect(taskExitOutcome(0)).toEqual({ status: 'done' })
    expect(taskExitOutcome(1)).toEqual({ status: 'failed' })
  })

  it('marks an unknowable daemon result as interrupted failure', () => {
    expect(taskExitOutcome(null)).toEqual({
      status: 'failed',
      error: 'terminal-interrupted'
    })
  })
})
