import { describe, expect, it } from 'vitest'
import { matchesQuery } from './Combobox'

describe('matchesQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesQuery('feature/login', '')).toBe(true)
    expect(matchesQuery('feature/login', '   ')).toBe(true)
  })

  it('is a case-insensitive substring match', () => {
    expect(matchesQuery('feature/Login-Form', 'login')).toBe(true)
    expect(matchesQuery('feature/login', 'logout')).toBe(false)
  })

  it('requires every whitespace-separated token', () => {
    expect(matchesQuery('feature/JIRA-123-login', 'feat 123')).toBe(true)
    expect(matchesQuery('feature/JIRA-123-login', 'feat 456')).toBe(false)
  })
})
