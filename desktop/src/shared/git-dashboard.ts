import type { IntegrationProvider } from './types'

export interface GitProjectBinding {
  integrationId: string
  fullName: string
}

export interface DashboardProject extends GitProjectBinding {
  provider: IntegrationProvider
  integrationName: string
}

export type DashboardKind = 'issue' | 'merge-request'
export type DashboardItemState = 'open' | 'closed' | 'merged'
export type DashboardReviewState = 'pending' | 'completed' | 'unknown'

export interface DashboardItem {
  id: number
  kind: DashboardKind
  title: string
  state: DashboardItemState
  url: string
  updatedAt: string
  assignees: string[]
  author: string
}

export interface DashboardDetail extends DashboardItem {
  body: string
  sourceBranch?: string
  targetBranch?: string
}

export interface DashboardReview {
  item: DashboardItem
  state: DashboardReviewState
}

export interface DashboardReviews {
  items: DashboardReview[]
  /** Null if the provider couldn't establish the complete pending count. */
  pendingCount: number | null
}

export interface DashboardFilter {
  kind: DashboardKind
  state: 'open' | 'all'
  assignee: 'me' | 'any'
}

export type DashboardError = 'unlinked' | 'unauthorized' | 'not-found' | 'rate-limited' | 'unavailable'
export type DashboardResult<T> = { data: T } | { error: DashboardError }

export interface DashboardList {
  items: DashboardItem[]
  truncated: boolean
}
