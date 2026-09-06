/**
 * BhoomiSetu Authentication API Service (Phase 3.1)
 * Interfaces with FastAPI /api/v1/auth endpoints.
 */

import { requestJson } from './client'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role_name: string
  department: string | null
  jurisdiction: string | null
  badge_number: string | null
  is_active: boolean
  last_login_at: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserProfile
}

export interface LoginPayload {
  email: string
  password?: string
}

import { wsService } from './websocket'

export const SEEDED_ACCOUNTS = [
  { email: 'anil.kumar@bhoomisetu.gov.in', name: 'Anil Kumar', role: 'district_officer', roleLabel: 'District Officer' },
  { email: 'ramesh.verma@bhoomisetu.gov.in', name: 'Ramesh Verma', role: 'field_surveyor', roleLabel: 'Field Surveyor' },
  { email: 'priya.sharma@bhoomisetu.gov.in', name: 'Priya Sharma', role: 'acquisition_officer', roleLabel: 'Acquisition Officer' },
  { email: 'rk.verma@bhoomisetu.gov.in', name: 'R. K. Verma', role: 'legal_officer', roleLabel: 'Legal Officer' },
  { email: 'auditor@bhoomisetu.gov.in', name: 'Auditor Desk', role: 'auditor', roleLabel: 'Auditor' },
  { email: 'admin@bhoomisetu.gov.in', name: 'System Admin', role: 'system_admin', roleLabel: 'System Admin' },
]

export async function loginApi(payload: LoginPayload): Promise<TokenResponse> {
  const data = await requestJson<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email,
      password: payload.password || 'bhoomisetu123',
    }),
  })
  localStorage.setItem('bhoomisetu_token', data.access_token)
  localStorage.setItem('bhoomisetu_access_token', data.access_token)
  localStorage.setItem('bhoomisetu_user', JSON.stringify(data.user))
  return data
}

export async function getCurrentUserApi(): Promise<UserProfile> {
  return requestJson<UserProfile>('/api/v1/auth/me')
}

export function getStoredUser(): UserProfile | null {
  const str = localStorage.getItem('bhoomisetu_user')
  if (!str) return null
  try {
    return JSON.parse(str) as UserProfile
  } catch {
    return null
  }
}

export function logoutApi(): void {
  wsService.disconnect()
  localStorage.removeItem('bhoomisetu_token')
  localStorage.removeItem('bhoomisetu_access_token')
  localStorage.removeItem('bhoomisetu_user')
}

