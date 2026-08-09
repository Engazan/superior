export type MaximizedByTab = Readonly<Record<string, string>>

export function maximizedForTab(
  state: MaximizedByTab,
  tabId: string | undefined
): string | null {
  return tabId ? state[tabId] ?? null : null
}

export function toggleMaximizedForTab(
  state: MaximizedByTab,
  tabId: string,
  sessionId: string
): MaximizedByTab {
  return state[tabId] === sessionId
    ? clearMaximizedForTab(state, tabId)
    : { ...state, [tabId]: sessionId }
}

export function clearMaximizedForTab(
  state: MaximizedByTab,
  tabId: string
): MaximizedByTab {
  if (!(tabId in state)) return state
  const { [tabId]: _removed, ...rest } = state
  return rest
}

export function removeMaximizedSession(
  state: MaximizedByTab,
  sessionId: string
): MaximizedByTab {
  const entry = Object.entries(state).find(([, id]) => id === sessionId)
  return entry ? clearMaximizedForTab(state, entry[0]) : state
}

export function replaceMaximizedSession(
  state: MaximizedByTab,
  previousId: string,
  nextId: string
): MaximizedByTab {
  const entry = Object.entries(state).find(([, id]) => id === previousId)
  return entry ? { ...state, [entry[0]]: nextId } : state
}
