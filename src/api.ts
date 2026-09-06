import type { Parcel } from './data'
import { requestJson } from './api/client'

export * from './api/index'

export type LandRiskInput = {
  parcel_id?: string
  state: string
  district: string
  land_type: string
  land_use: string
  project_type: string
  land_area: number
  number_of_owners: number
  ownership_complexity: number
  previous_dispute: number
  previous_objections: number
  land_value: number
  estimated_compensation: number
  environmental_risk: number
  road_accessibility: number
  distance_to_road: number
  stakeholder_count: number
  land_use_conflict: number
  documentation_completeness: number
  historical_acquisition_duration: number
}

export type ContributorEntry = {
  feature: string
  impact: number
  direction: 'increases_risk' | 'decreases_risk'
}

export type RiskPredictionResponse = {
  risk_probability: number
  risk_score: number
  risk_level: string
  acquisition_risk: number
  analysis_id?: string | null
  model_version?: string | null
  persisted_at?: string | null
  is_persisted?: boolean
}

export type RiskExplanationResponse = RiskPredictionResponse & {
  top_positive_contributors: ContributorEntry[]
  top_negative_contributors: ContributorEntry[]
  contributors: ContributorEntry[]
  explanation_method: string
  synthetic_data_warning: string
  decision_support_notice: string
}

export type ParcelAnalysis = {
  prediction: RiskPredictionResponse
  explanation: RiskExplanationResponse
  timestamp: number
}

export type ParcelAnalysisCache = Record<string, ParcelAnalysis>

export function formatFeatureName(feature: string): string {
  const labels: Record<string, string> = {
    ownership_complexity: 'Ownership complexity',
    previous_dispute: 'Previous dispute',
    land_value: 'Land value',
    estimated_compensation: 'Estimated compensation',
    historical_acquisition_duration: 'Historical acquisition duration',
    environmental_risk: 'Environmental risk',
    road_accessibility: 'Road accessibility',
    distance_to_road: 'Distance to road',
    stakeholder_count: 'Stakeholder count',
    land_use_conflict: 'Land-use conflict',
    documentation_completeness: 'Documentation completeness',
  }

  return labels[feature] ?? feature.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function parseNumberFromArea(value: string): number {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

function parseNumberFromCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const numeric = Number.parseFloat(cleaned)
  if (!Number.isFinite(numeric)) {
    return 0
  }

  const isCrore = /Cr|crore|cr/i.test(value)
  return isCrore ? numeric * 10000000 : numeric
}

function parseDelayMonths(value: string): number {
  const numeric = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

export function getProjectType(project: string): string {
  if (project.toLowerCase().includes('ganga') || project.toLowerCase().includes('flood')) {
    return 'Water management'
  }
  if (project.toLowerCase().includes('freight') || project.toLowerCase().includes('rail')) {
    return 'Rail infrastructure'
  }
  return 'Road infrastructure'
}

export function buildParcelRiskInput(parcel: Parcel): LandRiskInput {
  const landArea = parseNumberFromArea(parcel.area)
  const landValue = parseNumberFromCurrency(parcel.value)
  const months = parseDelayMonths(parcel.delay)
  const baseRisk = parcel.risk
  const ownershipComplexity = parcel.dispute ? 4.2 : 2.6
  const numberOfOwners = Math.max(2, Math.round(ownershipComplexity + (baseRisk > 60 ? 1 : 0)))
  const previousDispute = parcel.dispute ? 1 : 0
  const previousObjections = parcel.dispute ? 2 : 0
  const stakeholderCount = parcel.dispute ? 6 : 3
  const environmentalRisk = baseRisk > 70 ? 8.4 : baseRisk > 40 ? 5.7 : 3.2
  const roadAccessibility = baseRisk > 70 ? 2.1 : baseRisk > 40 ? 4.1 : 5.8
  const distanceToRoad = baseRisk > 70 ? 3.6 : baseRisk > 40 ? 2.4 : 1.1
  const landUseConflict = baseRisk > 70 ? 8.6 : baseRisk > 40 ? 5.4 : 2.7
  const documentationCompleteness = parcel.status === 'Objection' ? 3.4 : parcel.status === 'Under review' ? 5.1 : 7.5
  const estimatedCompensation = landValue * (baseRisk > 70 ? 0.96 : baseRisk > 40 ? 0.88 : 0.8)

  return {
    parcel_id: parcel.id,
    state: 'Bihar',
    district: parcel.district,
    land_type: parcel.landType,
    land_use: parcel.landUse,
    project_type: getProjectType(parcel.project),
    land_area: landArea,
    number_of_owners: numberOfOwners,
    ownership_complexity: ownershipComplexity,
    previous_dispute: previousDispute,
    previous_objections: previousObjections,
    land_value: landValue,
    estimated_compensation: estimatedCompensation,
    environmental_risk: environmentalRisk,
    road_accessibility: roadAccessibility,
    distance_to_road: distanceToRoad,
    stakeholder_count: stakeholderCount,
    land_use_conflict: landUseConflict,
    documentation_completeness: documentationCompleteness,
    historical_acquisition_duration: months,
  }
}

export async function predictRisk(payload: LandRiskInput): Promise<RiskPredictionResponse> {
  return requestJson<RiskPredictionResponse>('/api/v1/ai/risk/predict', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function explainRisk(payload: LandRiskInput, limit = 5): Promise<RiskExplanationResponse> {
  return requestJson<RiskExplanationResponse>(`/api/v1/ai/risk/explain?limit=${limit}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

