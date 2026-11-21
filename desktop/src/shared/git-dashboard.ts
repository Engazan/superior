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
export type DashboardPipeline = 'passed' | 'failed' | 'running'

export interface DashboardItem {
  id: number
  kind: DashboardKind
  title: string
  state: DashboardItemState
  url: string
  updatedAt: string
  assignees: string[]
  author: string
  labels?: { name: string; color?: string }[]
  comments?: number
  draft?: boolean
  pipeline?: DashboardPipeline
  conflicts?: boolean
  mergeReady?: boolean
  sourceBranch?: string
}

export interface DashboardDetail extends DashboardItem {
  body: string
  targetBranch?: string
  reviewers?: string[]
  createdAt?: string
  additions?: number
  deletions?: number
  approvals?: { required: number; remaining: number }
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
