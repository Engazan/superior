---
status: resolved
trigger: "dal som do tasks 3 vedi jednoduchu vec 'si tu ?' a vykonala sa len prva aj ked prvy prikaz zbehol tak realne by sa uz na nic nemalo cakat, aj ked vidim ikonku 'Cancel task' ale vidim ze process nic nerobi"
created: 2026-08-06
updated: 2026-08-06
---

# Debug Session: Tasks stuck after first prompt

## Symptoms

- Three tasks are submitted with the simple prompt "si tu ?".
- Only the first task executes.
- The first prompt appears to finish successfully.
- No further work should be pending after the first prompt completes.
- The UI still shows the "Cancel task" action.
- The process appears idle and does not execute the remaining tasks.

## Current Focus

- hypothesis: Default interactive agent presets do not exit after answering, while queue completion is defined exclusively by PTY exit.
- test: Verify task command generation uses the documented one-shot mode for Claude and Codex, then run focused tests and typecheck.
- expecting: The PTY exits after one answer, letting the exit listener mark the task finished and trigger the next queue item.
- next_action: archive resolved session

## Evidence

- timestamp: 2026-08-06T17:46:40Z; `useTaskQueue` marks a task finished only in its `onAgentExit` listener (or the already-exited spawn reply path), and the pump blocks every queued task in a folder while any task is `running`.
- timestamp: 2026-08-06T17:46:40Z; default presets launch interactive `claude --dangerously-skip-permissions` and `codex --dangerously-bypass-approvals-and-sandbox`; the installed CLIs document `claude --print` and `codex exec` as non-interactive modes that exit after a prompt.

## Eliminated

## Resolution

- root_cause: Tasks appended a prompt to interactive Claude/Codex preset commands, but task completion and queue advancement occur only after the terminal PTY exits; after answering, the interactive CLI stayed alive and left the task `running`.
- fix: Generate `codex exec` and `claude --print` commands for queued work, preserving already one-shot and custom preset commands so each standard agent task exits after one turn.
- verification: `npm test -- src/renderer/src/taskCommand.test.ts`; `npm run typecheck:web`; `npx eslint src/renderer/src/hooks/useTaskQueue.ts src/renderer/src/taskCommand.test.ts`; all passed.
- files_changed: src/renderer/src/hooks/useTaskQueue.ts; src/renderer/src/taskCommand.test.ts
- prevention: why not caught: no regression test exercised the default interactive preset in a queued task; guard: `taskCommand.test.ts` verifies the generated Claude/Codex one-shot commands.
