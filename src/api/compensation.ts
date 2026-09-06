import { requestJson } from './client'
import type { CompensationRecord } from '../data'

export interface ApiCompensationResponse {
  id: string
  record_code: string
  parcel_id: string
  parcel_id_str?: string | null
  project_id: string
  project_code?: string | null
  payee_name: string
  amount_inr: number
  status: string
  approved_by_user_id?: string | null
  disbursed_at?: string | null
  created_at: string
}

export interface ApiCompensationPaginatedResponse {
  items: ApiCompensationResponse[]
  page: number
  page_size: number
  total: number
}

export interface FetchCompensationParams {
  status?: string
  project?: string
  parcel?: string
  search?: string
  page?: number
  page_size?: number
}

export interface CompensationUpdatePayload {
  status?: string
  payee_name?: string
  amount_inr?: number
  approved_by_user_id?: string
}

export const ALLOWED_COMPENSATION_STATUSES = [
  'Pending approval',
  'Processing',
  'Ready',
  'Released',
] as const

export function getNextCompensationStatus(currentStatus: string): string {
  const currentIndex = ALLOWED_COMPENSATION_STATUSES.indexOf(currentStatus as any)
  if (currentIndex === -1 || currentIndex === ALLOWED_COMPENSATION_STATUSES.length - 1) {
    return ALLOWED_COMPENSATION_STATUSES[0]
  }
  return ALLOWED_COMPENSATION_STATUSES[currentIndex + 1]
}

export async function fetchCompensations(params?: FetchCompensationParams): Promise<ApiCompensationPaginatedResponse> {
  const queryParams = new URLSearchParams()
  if (params?.status && params.status !== 'All') queryParams.set('status', params.status)
  if (params?.project) queryParams.set('project', params.project)
  if (params?.parcel) queryParams.set('parcel', params.parcel)
  if (params?.search) queryParams.set('search', params.search)
  if (params?.page) queryParams.set('page', String(params.page))
  if (params?.page_size) queryParams.set('page_size', String(params.page_size))

  const queryString = queryParams.toString()
  const endpoint = `/api/v1/compensation${queryString ? `?${queryString}` : ''}`

  return requestJson<ApiCompensationPaginatedResponse>(endpoint)
}

export async function updateCompensation(id: string, payload: CompensationUpdatePayload): Promise<ApiCompensationResponse> {
  return requestJson<ApiCompensationResponse>(`/api/v1/compensation/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function formatInrCurrency(amount: number): string {
  if (amount >= 10000000) {
    return `Rs ${(amount / 10000000).toFixed(2)} Cr`
  }
  if (amount >= 100000) {
    return `Rs ${(amount / 100000).toFixed(2)} Lakh`
  }
  return `Rs ${amount.toLocaleString()}`
}

export function mapApiCompensationToUi(apiComp: ApiCompensationResponse): CompensationRecord {
  return {
    id: apiComp.record_code || apiComp.id,
    dbId: apiComp.id,
    parcelId: apiComp.parcel_id_str || 'BR-042-0187',
    projectId: apiComp.project_code || 'NH-327',
    payee: apiComp.payee_name,
    amount: formatInrCurrency(apiComp.amount_inr),
    rawAmount: apiComp.amount_inr,
    status: (apiComp.status as any) || 'Pending approval',
    date: apiComp.created_at ? new Date(apiComp.created_at).toLocaleDateString() : '2026-09-01',
    disbursedAt: apiComp.disbursed_at || undefined,
  }
}
