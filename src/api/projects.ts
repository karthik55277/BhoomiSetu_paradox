/**
 * Projects API service for BhoomiSetu.
 * Matches backend schemas from backend/app/schemas_v1.py.
 */

import { requestJson } from './client'

export type UiProject = {
  id: string
  name: string
  type: string
  district: string
  parcels: number
  progress: number
  status: string
  target: string
}


export type ApiProjectResponse = {
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
}

export type ApiProjectDetailResponse = ApiProjectResponse & {
  parcels_summary: Array<Record<string, unknown>>
}

export type PaginatedProjectsResponse = {
  items: ApiProjectResponse[]
  page: number
  page_size: number
  total: number
}

function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return 'TBD'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export function mapApiProjectToUi(apiProj: ApiProjectResponse): UiProject {
  return {
    id: apiProj.code,
    name: apiProj.name,
    type: apiProj.project_type,
    district: apiProj.district,
    parcels: apiProj.parcel_count || apiProj.total_parcels_target,
    progress: Math.round(apiProj.acquisition_progress_pct),
    status: apiProj.status,
    target: formatDateDisplay(apiProj.target_completion_date),
  }
}

export async function fetchProjects(): Promise<{ raw: ApiProjectResponse[]; ui: UiProject[] }> {
  const data = await requestJson<PaginatedProjectsResponse>('/api/v1/projects')
  const raw = data.items || []
  const ui = raw.map(mapApiProjectToUi)
  return { raw, ui }
}

export async function fetchProjectByCode(code: string): Promise<{ raw: ApiProjectDetailResponse; ui: UiProject }> {
  const raw = await requestJson<ApiProjectDetailResponse>(`/api/v1/projects/${encodeURIComponent(code)}`)
  const ui = mapApiProjectToUi(raw)
  return { raw, ui }
}
