import { app, net, shell } from 'electron'
import type { UpdateInfo } from '@shared/types'

// The published repository whose GitHub releases we check against.
const OWNER = 'Engazan'
const REPO = 'superior'
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases`
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`

/** Parse 'v1.2.3' / '1.2.3' into numeric parts, ignoring any pre-release suffix. */
function parseVersion(raw: string): number[] {
  const core = raw.trim().replace(/^v/i, '').split(/[-+]/, 1)[0]
  return core.split('.').map((n) => Number.parseInt(n, 10) || 0)
}

/** Positive when `a` is newer than `b`, negative when older, 0 when equal. */
function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Ask GitHub for the latest published release and compare it to the running
 * version. Network or parse failures resolve to "no update" so a check never
 * throws into the UI.
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()
  const fallback: UpdateInfo = {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: RELEASES_PAGE
  }
  try {
    const res = await net.fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${REPO}-app` }
    })
    if (!res.ok) return fallback
    const json = (await res.json()) as { tag_name?: string; html_url?: string }
    const tag = json.tag_name?.trim()
    if (!tag) return fallback
    const latestVersion = tag.replace(/^v/i, '')
    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      releaseUrl: json.html_url || RELEASES_PAGE
    }
  } catch {
    return fallback
  }
}

/** Open the release page in the system browser. Only github.com URLs are honored. */
export function openReleasePage(url?: string): Promise<void> {
  const safe = url && /^https:\/\/github\.com\//i.test(url) ? url : RELEASES_PAGE
  return shell.openExternal(safe)
}
