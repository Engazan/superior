import { describe, expect, it } from 'vitest'
import { parseChecks } from './pull-request'
describe('PR checks', () => {
  it('distinguishes pending, failing, skipped and unknown results', () => {
    expect(parseChecks([
      { name: 'test', status: 'IN_PROGRESS' },
      { name: 'build', conclusion: 'FAILURE', detailsUrl: 'https://github.com/run' },
      { context: 'legacy', state: 'SUCCESS' },
      { name: 'optional', conclusion: 'SKIPPED' },
      { name: 'unknown', status: 'COMPLETED', detailsUrl: 'javascript:bad()' },
      null
    ])).toEqual([
      { name: 'test', status: 'pending', url: '' },
      { name: 'build', status: 'failed', url: 'https://github.com/run' },
      { name: 'legacy', status: 'passed', url: '' },
      { name: 'optional', status: 'skipped', url: '' },
      { name: 'unknown', status: 'unknown', url: '' }
    ])
  })
  it('does not manufacture passing checks for an empty response', () => {
    expect(parseChecks(null)).toEqual([])
  })
})
