import { describe, expect, it } from 'vitest'
import { buildTaskCommand } from './hooks/useTaskQueue'

describe('buildTaskCommand', () => {
  it('uses Codex exec so a queued prompt exits after one turn', () => {
    expect(
      buildTaskCommand('codex --dangerously-bypass-approvals-and-sandbox', 'si tu ?', 'darwin')
    ).toBe("codex exec --dangerously-bypass-approvals-and-sandbox 'si tu ?'")
  })

  it('uses Claude print mode so a queued prompt exits after one turn', () => {
    expect(
      buildTaskCommand('claude --dangerously-skip-permissions', 'si tu ?', 'darwin')
    ).toBe("claude --dangerously-skip-permissions --print 'si tu ?'")
  })

  it('does not duplicate an existing one-shot mode or change custom commands', () => {
    expect(buildTaskCommand('codex exec --json', 'si tu ?', 'darwin')).toBe(
      "codex exec --json 'si tu ?'"
    )
    expect(buildTaskCommand('claude --print', 'si tu ?', 'darwin')).toBe(
      "claude --print 'si tu ?'"
    )
    expect(buildTaskCommand('agent-run --batch', 'hello', 'darwin')).toBe(
      "agent-run --batch 'hello'"
    )
  })
})
