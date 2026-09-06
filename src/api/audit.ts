import { requestJson } from './client'
import type { AuditEvent } from '../data'

export interface ApiAuditEventResponse {
  id: string
  event_code: string
  title: string
  entity_table: string
  entity_id?: string | null
  parcel_id?: string | null
  project_id?: string | null
  actor_user_id?: string | null
  actor_name: string
  action_type: string
  prev_hash: string
  current_hash: string
  payload: Record<string, any>
  ip_address?: string | null
  created_at: string
}

export interface AuditChainHealth {
  event_count: number
  latest_hash: string
  chain_valid: boolean
}

export interface ApiAuditPaginatedResponse {
  items: ApiAuditEventResponse[]
  page: number
  page_size: number
  total: number
  chain_health: AuditChainHealth
}

export interface FetchAuditParams {
  action_type?: string
  project?: string
  parcel?: string
  search?: string
  page?: number
  page_size?: number
}

export async function fetchAuditEvents(params?: FetchAuditParams): Promise<ApiAuditPaginatedResponse> {
  const queryParams = new URLSearchParams()
  if (params?.action_type && params.action_type !== 'All') queryParams.set('action_type', params.action_type)
  if (params?.project) queryParams.set('project', params.project)
  if (params?.parcel) queryParams.set('parcel', params.parcel)
  if (params?.search) queryParams.set('search', params.search)
  if (params?.page) queryParams.set('page', String(params.page))
  if (params?.page_size) queryParams.set('page_size', String(params.page_size))

  const queryString = queryParams.toString()
  const endpoint = `/api/v1/audit${queryString ? `?${queryString}` : ''}`

  return requestJson<ApiAuditPaginatedResponse>(endpoint)
}

export function formatAuditTimestamp(isoString: string): string {
  if (!isoString) return 'Recent'
  try {
    const d = new Date(isoString)
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return `${dateStr} · ${timeStr} UTC`
  } catch {
    return isoString
  }
}

export function mapApiAuditEventToUi(apiEv: ApiAuditEventResponse): AuditEvent {
  return {
    id: apiEv.event_code || apiEv.id,
    dbId: apiEv.id,
    title: apiEv.title,
    actor: apiEv.actor_name,
    timestamp: formatAuditTimestamp(apiEv.created_at),
    payloadHash: apiEv.current_hash ? apiEv.current_hash.substring(0, 16) : 'VERIFIED',
    status: 'VERIFIED',
    actionType: apiEv.action_type,
    entityTable: apiEv.entity_table,
    currentHash: apiEv.current_hash,
    prevHash: apiEv.prev_hash,
    payload: apiEv.payload,
  }
}
