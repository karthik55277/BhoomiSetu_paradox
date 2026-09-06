import { requestJson } from './client'
import type { DisputeRecord } from '../data'

export interface ApiDisputeResponse {
  id: string
  dispute_code: string
  parcel_id: string
  parcel_id_str?: string | null
  project_id: string
  project_code?: string | null
  assigned_user_id?: string | null
  assigned_officer_name: string
  category: string
  status: string
  priority: string
  description: string
  filed_date: string
  resolved_at?: string | null
  created_at: string
}

export interface ApiDisputesPaginatedResponse {
  items: ApiDisputeResponse[]
  page: number
  page_size: number
  total: number
}

export interface FetchDisputesParams {
  status?: string
  priority?: string
  category?: string
  project?: string
  parcel?: string
  search?: string
  page?: number
  page_size?: number
}

export interface DisputeUpdatePayload {
  status?: string
  priority?: string
  assigned_officer_name?: string
  description?: string
}

export async function fetchDisputes(params?: FetchDisputesParams): Promise<ApiDisputesPaginatedResponse> {
  const queryParams = new URLSearchParams()
  if (params?.status && params.status !== 'All') queryParams.set('status', params.status)
  if (params?.priority && params.priority !== 'All') queryParams.set('priority', params.priority)
  if (params?.category) queryParams.set('category', params.category)
  if (params?.project) queryParams.set('project', params.project)
  if (params?.parcel) queryParams.set('parcel', params.parcel)
  if (params?.search) queryParams.set('search', params.search)
  if (params?.page) queryParams.set('page', String(params.page))
  if (params?.page_size) queryParams.set('page_size', String(params.page_size))

  const queryString = queryParams.toString()
  const endpoint = `/api/v1/disputes${queryString ? `?${queryString}` : ''}`

  return requestJson<ApiDisputesPaginatedResponse>(endpoint)
}

export async function updateDispute(id: string, payload: DisputeUpdatePayload): Promise<ApiDisputeResponse> {
  return requestJson<ApiDisputeResponse>(`/api/v1/disputes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function mapApiDisputeToUi(apiDispute: ApiDisputeResponse): DisputeRecord {
  return {
    id: apiDispute.dispute_code || apiDispute.id,
    dbId: apiDispute.id,
    parcelId: apiDispute.parcel_id_str || 'BR-042-0187',
    category: apiDispute.category,
    status: (apiDispute.status as any) || 'Under review',
    assignedTo: apiDispute.assigned_officer_name || 'Unassigned',
    priority: (apiDispute.priority as any) || 'MEDIUM',
    projectId: apiDispute.project_code || 'NH-327',
    description: apiDispute.description,
    date: apiDispute.filed_date || '2026-09-01',
    filedDate: apiDispute.filed_date,
    resolvedAt: apiDispute.resolved_at || undefined,
  }
}
