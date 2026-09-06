/**
 * Parcels API service for BhoomiSetu.
 * Matches backend schemas from backend/app/schemas_v1.py and backend/app/api/routes/parcels.py.
 */

import { requestJson } from './client'
import type { Parcel as UiParcel } from '../data'

export type ApiParcelResponse = {
  id: string
  parcel_id: string
  project_id: string
  project_code: string | null
  survey_number: string
  state: string
  district: string
  land_area_ha: number
  land_type: string
  land_use: string
  acquisition_status: string
  baseline_risk_score: number
  suitability_score: number
  estimated_delay_months: number
  land_value_inr: number
  estimated_compensation_inr: number
  created_at: string
  updated_at: string
}

export type ApiCurrentAiResult = {
  id: string
  model_version: string
  risk_score: number
  risk_probability: number
  risk_level: string
  acquisition_risk: number
  top_positive_contributors: Array<{ feature: string; impact: number; direction: string }>
  top_negative_contributors: Array<{ feature: string; impact: number; direction: string }>
  is_current?: boolean
  created_at?: string
}

export type ApiParcelDetailResponse = ApiParcelResponse & {
  project?: {
    id: string
    code: string
    name: string
    project_type: string
    district: string
    total_parcels_target: number
    acquisition_progress_pct: number
    status: string
    target_completion_date: string | null
    created_at: string
    parcel_count: number
  } | null
  owners: Array<{
    id: string
    parcel_id: string
    owner_name: string
    share_percentage: number
    is_primary: boolean
    contact_phone: string | null
    created_at: string
  }>
  ml_features: Record<string, unknown>
  current_ai_result: ApiCurrentAiResult | null
  disputes: Array<Record<string, unknown>>
  compensations: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
  geometry_summary?: {
    srid: number
    type: string
    centroid: [number, number] | null
    map_ui_x: number | null
    map_ui_y: number | null
  } | null
}

export type PaginatedParcelsResponse = {
  items: ApiParcelResponse[]
  page: number
  page_size: number
  total: number
}

export type FetchParcelsParams = {
  project?: string
  district?: string
  acquisition_status?: string
  risk_level?: string
  search?: string
  page?: number
  page_size?: number
}

function formatCurrencyCrores(amountInr: number): string {
  if (!amountInr || amountInr === 0) return 'Rs 0'
  const crores = amountInr / 10000000
  return `Rs ${crores.toFixed(2)} Cr`
}

export function mapApiParcelToUi(apiParcel: ApiParcelResponse | ApiParcelDetailResponse): UiParcel {
  const primaryOwner = ('owners' in apiParcel && apiParcel.owners?.find((o) => o.is_primary)?.owner_name)
    || ('owners' in apiParcel && apiParcel.owners?.[0]?.owner_name)
    || 'S. K. Prasad'

  const hasDispute = ('disputes' in apiParcel && (apiParcel.disputes?.length || 0) > 0)
    || apiParcel.baseline_risk_score > 60

  const geom = ('geometry_summary' in apiParcel) ? apiParcel.geometry_summary : null
  const mapX = (geom && typeof geom.map_ui_x === 'number') ? geom.map_ui_x : 50
  const mapY = (geom && typeof geom.map_ui_y === 'number') ? geom.map_ui_y : 50


  const riskScore = Math.round(apiParcel.baseline_risk_score)
  const color = riskScore > 60 ? '#d8634d' : riskScore > 30 ? '#e9a23b' : '#54a884'

  return {
    id: apiParcel.parcel_id,
    survey: apiParcel.survey_number,
    district: apiParcel.district,
    area: `${apiParcel.land_area_ha.toFixed(2)} ha`,
    status: apiParcel.acquisition_status,
    risk: riskScore,
    suitability: Math.round(apiParcel.suitability_score),
    delay: `${apiParcel.estimated_delay_months.toFixed(1)} months`,
    x: mapX,
    y: mapY,
    color: color,
    owner: primaryOwner,
    landType: apiParcel.land_type,
    landUse: apiParcel.land_use,
    project: apiParcel.project_code || 'NH-327 Ring Road',
    value: formatCurrencyCrores(apiParcel.land_value_inr),
    dispute: hasDispute,
  }
}

export async function fetchParcels(params: FetchParcelsParams = {}): Promise<{
  raw: ApiParcelResponse[]
  ui: UiParcel[]
  total: number
  page: number
  page_size: number
}> {
  const queryParts: string[] = []

  if (params.project) queryParts.push(`project=${encodeURIComponent(params.project)}`)
  if (params.district) queryParts.push(`district=${encodeURIComponent(params.district)}`)
  if (params.acquisition_status && params.acquisition_status !== 'All statuses') {
    queryParts.push(`acquisition_status=${encodeURIComponent(params.acquisition_status)}`)
  }
  if (params.risk_level && params.risk_level !== 'All risk levels') {
    queryParts.push(`risk_level=${encodeURIComponent(params.risk_level)}`)
  }
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`)
  if (params.page) queryParts.push(`page=${params.page}`)
  if (params.page_size) queryParts.push(`page_size=${params.page_size}`)

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  const data = await requestJson<PaginatedParcelsResponse>(`/api/v1/parcels${queryString}`)
  
  const raw = data.items || []
  const ui = raw.map(mapApiParcelToUi)
  
  return {
    raw,
    ui,
    total: data.total || raw.length,
    page: data.page || 1,
    page_size: data.page_size || 20,
  }
}

export async function fetchParcelDetail(parcelIdOrCode: string): Promise<{
  raw: ApiParcelDetailResponse
  ui: UiParcel
}> {
  const raw = await requestJson<ApiParcelDetailResponse>(`/api/v1/parcels/${encodeURIComponent(parcelIdOrCode)}`)
  const ui = mapApiParcelToUi(raw)
  return { raw, ui }
}
