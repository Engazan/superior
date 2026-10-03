import { browserUrl } from '@shared/browser'

/** Terminal selection stays unchanged unless the user explicitly follows a link. */
export function activateTerminalUrl(
  event: Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'preventDefault'>,
  url: string,
  open: (url: string) => void
): void {
  if (!event.ctrlKey && !event.metaKey) return
  if (!/^https?:\/\//i.test(url)) return
  let safeUrl: string
  try { safeUrl = browserUrl(url) } catch { return }
  event.preventDefault()
  open(safeUrl)
}
