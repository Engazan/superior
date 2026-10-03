import type { MessageKey, TFunction } from './i18n'
import type { IntegrationProvider } from './types'

interface ProviderMeta {
  value: IntegrationProvider
  label: string
  logo: string
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const PROVIDER_LOGOS: Record<IntegrationProvider, string> = {
  github: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#ffffff"/>
      <path fill="#181717" d="M16 .6C7.5.6.7 7.5.7 16c0 6.8 4.4 12.5 10.5 14.6.8.1 1.1-.3 1.1-.8v-2.7c-4.3.9-5.2-1.8-5.2-1.8-.7-1.8-1.7-2.3-1.7-2.3-1.4-.9.1-.9.1-.9 1.5.1 2.4 1.6 2.4 1.6 1.4 2.4 3.6 1.7 4.5 1.3.1-1 .5-1.7 1-2.1-3.4-.4-7-1.7-7-7.6 0-1.7.6-3 1.6-4.1-.2-.4-.7-2 .2-4 0 0 1.3-.4 4.2 1.6 1.2-.3 2.5-.5 3.8-.5s2.6.2 3.8.5c2.9-2 4.2-1.6 4.2-1.6.9 2 .3 3.6.2 4 1 1.1 1.6 2.4 1.6 4.1 0 5.9-3.6 7.2-7 7.6.6.5 1.1 1.4 1.1 2.8v4.1c0 .4.3.9 1.1.8 6.1-2 10.5-7.8 10.5-14.6C31.3 7.5 24.5.6 16 .6Z"/>
    </svg>
  `),
  gitlab: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#fff4e6"/>
      <path fill="#E24329" d="M16 28 4.5 11.4h7.2L16 28Z"/>
      <path fill="#FC6D26" d="M16 28 27.5 11.4h-7.2L16 28Z"/>
      <path fill="#FCA326" d="M4.5 11.4 2.8 17c-.2.7 0 1.4.6 1.8L16 28 4.5 11.4Z"/>
      <path fill="#FCA326" d="m27.5 11.4 1.7 5.6c.2.7 0 1.4-.6 1.8L16 28l11.5-16.6Z"/>
      <path fill="#E24329" d="m11.7 11.4 1.8-5.6c.2-.7 1.1-.7 1.3 0L16 9.4l1.2-3.6c.2-.7 1.1-.7 1.3 0l1.8 5.6H11.7Z"/>
      <path fill="#FC6D26" d="m11.7 11.4 4.3 16.6 4.3-16.6H11.7Z"/>
    </svg>
  `),
  gitea: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#609926"/>
      <path fill="#ffffff" d="M9 10.4h12.1c.6 0 1 .4 1 1v1.2h1.4c2 0 3.5 1.5 3.5 3.4s-1.6 3.4-3.5 3.4h-1.8c-.8 3-3.4 5.1-6.5 5.1h-2.1c-3.8 0-6.8-3.1-6.8-6.8v-4.6c0-1.5 1.2-2.7 2.7-2.7Zm13.1 4.4v2.3h1.4c.7 0 1.2-.5 1.2-1.1s-.5-1.2-1.2-1.2h-1.4Z"/>
      <path fill="#609926" d="M12.7 14.9a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm5.2 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm-2.7 2.8c-1.5 0-2.7 1.1-2.9 2.5h1.5a1.5 1.5 0 0 1 2.8 0h1.5c-.2-1.4-1.4-2.5-2.9-2.5Z"/>
    </svg>
  `)
}

/** The three supported forges, in the order shown in the provider picker. */
export const INTEGRATION_PROVIDERS: ProviderMeta[] = [
  { value: 'github', label: 'GitHub', logo: PROVIDER_LOGOS.github },
  { value: 'gitlab', label: 'GitLab', logo: PROVIDER_LOGOS.gitlab },
  { value: 'gitea', label: 'Gitea', logo: PROVIDER_LOGOS.gitea }
]

export function providerLabel(provider: IntegrationProvider): string {
  return INTEGRATION_PROVIDERS.find((p) => p.value === provider)?.label ?? provider
}

export function providerLogo(provider: IntegrationProvider): string {
  return PROVIDER_LOGOS[provider]
}

/** Map a stable backend error code to a localized message. */
const KNOWN: Record<string, MessageKey> = {
  'missing-token': 'integrations.errMissingToken',
  'missing-url': 'integrations.errMissingUrl',
  unauthorized: 'integrations.errUnauthorized',
  refused: 'integrations.errRefused',
  'not-found': 'integrations.errNotFound',
  timeout: 'integrations.errTimeout',
  network: 'integrations.errNetwork',
  'unknown-integration': 'integrations.errUnknown',
  'invalid-repo': 'integrations.errInvalidRepo',
  'dest-exists': 'integrations.errDestExists',
  'git-missing': 'integrations.errGitMissing'
}

/**
 * Turn a backend error code into a user-facing string. Known codes are
 * localized; an `http-<status>` code is shown with its number; anything else
 * (a raw git/network message) is returned verbatim.
 */
export function describeIntegrationError(code: string, t: TFunction): string {
  const key = KNOWN[code]
  if (key) return t(key)
  if (code.startsWith('http-')) return t('integrations.errHttp', { status: code.slice(5) })
  return code
}
