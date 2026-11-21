import type { GitProjectBinding } from '@shared/git-dashboard'
import type { Integration } from '@shared/types'

interface RemoteLocation {
  host: string
  path: string
  ssh: boolean
}

function remoteLocation(value: string): RemoteLocation | null {
  try {
    if (!value.includes('://')) {
      const scp = /^(?:[^@/\s]+@)?([\w.-]+):([^\s]+)$/.exec(value)
      return scp ? { host: scp[1].toLowerCase(), path: scp[2], ssh: true } : null
    }
    const url = new URL(value)
    if (url.search || url.hash || !['https:', 'http:', 'ssh:'].includes(url.protocol)) return null
    const ssh = url.protocol === 'ssh:'
    return { host: ssh ? url.hostname : url.host, path: url.pathname, ssh }
  } catch {
    return null
  }
}

export function repositoryName(value: string): string | null {
  return /^[\w.-]+(?:\/[\w.-]+)+$/.test(value) &&
    value.split('/').every((part) => part !== '.' && part !== '..')
    ? value
    : null
}

export function repositoryFromOrigin(origin: string, integration: Integration): string | null {
  const remote = remoteLocation(origin)
  if (!remote) return null
  let base: URL
  try {
    base = new URL(integration.baseUrl || (integration.provider === 'github' ? 'https://github.com' : ''))
  } catch {
    return null
  }

  const publicGithub = integration.provider === 'github' &&
    ['github.com', 'www.github.com', 'api.github.com'].includes(base.host)
  const matchingHost = publicGithub
    ? ['github.com', 'www.github.com'].includes(remote.host)
    : remote.host === (remote.ssh ? base.hostname : base.host)
  const matchingSshAlias = remote.ssh && remote.host === integration.sshHost
  if (!matchingHost && !matchingSshAlias) return null

  const path = remote.path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  const prefix = publicGithub ? '' : base.pathname.replace(/^\/+|\/+$/g, '')
  if (prefix && !path.startsWith(prefix + '/')) return null
  return repositoryName(path.slice(prefix ? prefix.length + 1 : 0))
}

function sameRepository(provider: Integration['provider'], a: string, b: string): boolean {
  return provider === 'gitlab' ? a === b : a.toLowerCase() === b.toLowerCase()
}

/** Resolve an integration without sending credentials or probing multiple forge accounts. */
export function matchForgeProject(origin: string, integrations: Integration[], saved?: GitProjectBinding) {
  const matches = integrations.flatMap((integration) => {
    const fullName = repositoryFromOrigin(origin, integration)
    return fullName ? [{ integration, fullName }] : []
  })
  const bound = saved && matches.find(({ integration, fullName }) =>
    integration.id === saved.integrationId && sameRepository(integration.provider, fullName, saved.fullName))
  if (saved) return bound ?? null
  return matches.length === 1 ? matches[0] : null
}
