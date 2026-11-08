/** Tools advertised only to explicit coordinator chats and their scoped workers. */
const schema = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false })
const text = { type: 'string' }
export function orchestrationTools(coordinator: boolean) {
  return [
    ...(coordinator ? [{ type: 'function', name: 'superior_worker_start',
      description: 'Delegate an independent coding task to a Codex worker in a new isolated worktree based on this workspace committed HEAD. Up to 3 workers run concurrently. Uncommitted parent edits are not copied. Returns a durable dispatch id; use superior_workers to collect results. Workers do not push or merge.',
      inputSchema: schema({ name: text, prompt: text }, ['name', 'prompt']) }] : []),
    { type: 'function', name: 'superior_workers', description: 'Read worker states, final response summaries, branches and your inbox. waitSeconds (0-25) waits for a state change without busy polling. A failed or interrupted worker is not success.',
      inputSchema: schema({ waitSeconds: { type: 'integer', minimum: 0, maximum: 25 } }, ['waitSeconds']) },
    { type: 'function', name: 'superior_message', description: 'Send a durable scoped message to a worker dispatch id or to parent. Running agents read it with superior_workers; idle agents receive it on their next turn. No terminal input is injected.',
      inputSchema: schema({ to: text, text }, ['to', 'text']) }
  ]
}
