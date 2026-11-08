import { describe, expect, it } from 'vitest'
import { contextPrompt } from './agentContext'
describe('agent context transport', () => {
  it('preserves source lines and Unicode while removing terminal controls', () => {
    const prompt = contextPrompt({ source: 'src/žltý.ts', text: 'a\n\u001b[201~\u0003b', firstLine: 3, lastLine: 4 }, 'Explain')
    expect(prompt).toContain('src/žltý.ts:3-4')
    expect(prompt).toContain('a\n[201~b')
    expect(prompt).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/)
  })
})
