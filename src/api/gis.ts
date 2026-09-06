import { requestJson } from './client'
import type { Parcel } from '../data'

export interface ApiGeoJSONGeometry {
  type: string
  coordinates: any
}

export interface ApiGisParcelProperties {
  parcel_id: string
  survey_number: string
  district: string
  project: string | null
  acquisition_status: string
  land_area_ha: number
  land_type: string
  land_use: string
  baseline_risk_score: number
  risk_level: string | null
  risk_score: number
  ui_x?: number | null
  ui_y?: number | null
}

export interface ApiGeoJSONFeature {
  type: 'Feature'
  geometry: ApiGeoJSONGeometry
  properties: ApiGisParcelProperties
}

export interface ApiGeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: ApiGeoJSONFeature[]
}

export interface FetchGisParams {
  bbox?: string
  district?: string
  project?: string
  acquisition_status?: string
  risk_level?: string
  limit?: number
}

export async function fetchGisParcels(params?: FetchGisParams): Promise<ApiGeoJSONFeatureCollection> {
  const queryParams = new URLSearchParams()
  if (params?.bbox) queryParams.set('bbox', params.bbox)
  if (params?.district) queryParams.set('district', params.district)
  if (params?.project) queryParams.set('project', params.project)
  if (params?.acquisition_status) queryParams.set('acquisition_status', params.acquisition_status)
  if (params?.risk_level) queryParams.set('risk_level', params.risk_level)
  if (params?.limit) queryParams.set('limit', String(params.limit))

  const queryString = queryParams.toString()
  const endpoint = `/api/v1/gis/parcels${queryString ? `?${queryString}` : ''}`

  return requestJson<ApiGeoJSONFeatureCollection>(endpoint)
}

export function mapGisFeatureToParcel(feature: ApiGeoJSONFeature): Parcel {
  const p = feature.properties
  const score = Math.round(p.risk_score ?? p.baseline_risk_score)
  const color = score > 60 ? '#d8634d' : score > 30 ? '#e9a23b' : '#54a884'

  return {
    id: p.parcel_id,
    survey: p.survey_number,
    district: p.district,
    area: `${p.land_area_ha} ha`,
    status: p.acquisition_status,
    risk: score,
    suitability: 85,
    delay: '6.0 months',
    x: p.ui_x ?? 50,
    y: p.ui_y ?? 50,
    color,
    owner: 'Primary Owner',
    landType: p.land_type,
    landUse: p.land_use,
    project: p.project || 'NH-327 Ring Road',
    value: 'Rs 1.86 Cr',
    dispute: p.acquisition_status.toLowerCase().includes('dispute') || score > 70,
  }
}
