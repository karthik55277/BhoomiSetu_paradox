import { requestJson } from './client'

export interface LandRiskInput {
  state?: string
  district?: string
  land_type?: string
  land_use?: string
  project_type?: string
  land_area?: number
  number_of_owners?: number
  ownership_complexity?: number
  previous_dispute?: number
  previous_objections?: number
  land_value?: number
  estimated_compensation?: number
  environmental_risk?: number
  road_accessibility?: number
  distance_to_road?: number
  stakeholder_count?: number
  land_use_conflict?: number
  documentation_completeness?: number
  historical_acquisition_duration?: number
  parcel_id?: string
}

export interface RiskPredictionResponse {
  risk_score: number
  risk_level: string
  risk_probability: number
  acquisition_risk: number
  model_version: string
  analysis_id?: string
  persisted_at?: string
  is_persisted: boolean
}

export interface ShapContributor {
  feature: string
  impact: number
  value: number
}

export interface RiskExplanationResponse extends RiskPredictionResponse {
  explanation_method: string
  contributors: ShapContributor[]
  top_positive_contributors: ShapContributor[]
  top_negative_contributors: ShapContributor[]
}

export interface ApiAiAnalysisRecord {
  id: string
  parcel_id: string
  model_version: string
  acquisition_risk_class: number
  risk_level: string
  risk_score: number
  risk_probability: number
  explanation_method: string
  shap_contributors: ShapContributor[]
  top_positive_contributors: ShapContributor[]
  top_negative_contributors: ShapContributor[]
  input_features_snapshot: Record<string, any>
  is_current: boolean
  created_at: string
}

export async function predictRisk(payload: LandRiskInput, parcelId?: string): Promise<RiskPredictionResponse> {
  const body = parcelId ? { ...payload, parcel_id: parcelId } : payload
  return requestJson<RiskPredictionResponse>('/api/v1/ai/risk/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function explainRisk(payload: LandRiskInput, limit = 5, parcelId?: string): Promise<RiskExplanationResponse> {
  const body = parcelId ? { ...payload, parcel_id: parcelId } : payload
  return requestJson<RiskExplanationResponse>(`/api/v1/ai/risk/explain?limit=${limit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function fetchParcelAiHistory(parcelIdOrCode: string): Promise<ApiAiAnalysisRecord[]> {
  return requestJson<ApiAiAnalysisRecord[]>(`/api/v1/parcels/${encodeURIComponent(parcelIdOrCode)}/ai-history`)
}
