import { requestJson } from './client'
import type { DocumentRecord } from '../data'

export interface ApiDocumentResponse {
  id: string
  document_code: string
  title: string
  parcel_id?: string | null
  parcel_id_str?: string | null
  project_id: string
  project_code?: string | null
  category: string
  storage_path: string
  file_size_bytes: number
  mime_type: string
  verification_status: string
  uploaded_by_user_id?: string | null
  created_at: string
}

export interface ApiDocumentsPaginatedResponse {
  items: ApiDocumentResponse[]
  page: number
  page_size: number
  total: number
}

export interface FetchDocumentsParams {
  category?: string
  verification_status?: string
  project?: string
  parcel?: string
  search?: string
  page?: number
  page_size?: number
}

export interface DocumentCreatePayload {
  document_code: string
  title: string
  project_id: string
  parcel_id?: string
  category: string
  storage_path: string
  file_size_bytes: number
  mime_type?: string
  verification_status?: string
}

export async function fetchDocuments(params?: FetchDocumentsParams): Promise<ApiDocumentsPaginatedResponse> {
  const queryParams = new URLSearchParams()
  if (params?.category && params.category !== 'All') queryParams.set('category', params.category)
  if (params?.verification_status && params.verification_status !== 'All') queryParams.set('verification_status', params.verification_status)
  if (params?.project) queryParams.set('project', params.project)
  if (params?.parcel) queryParams.set('parcel', params.parcel)
  if (params?.search) queryParams.set('search', params.search)
  if (params?.page) queryParams.set('page', String(params.page))
  if (params?.page_size) queryParams.set('page_size', String(params.page_size))

  const queryString = queryParams.toString()
  const endpoint = `/api/v1/documents${queryString ? `?${queryString}` : ''}`

  return requestJson<ApiDocumentsPaginatedResponse>(endpoint)
}

export async function createDocumentMetadata(payload: DocumentCreatePayload): Promise<ApiDocumentResponse> {
  return requestJson<ApiDocumentResponse>('/api/v1/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${bytes} B`
}

export function mapApiDocumentToUi(apiDoc: ApiDocumentResponse): DocumentRecord {
  return {
    id: apiDoc.document_code || apiDoc.id,
    dbId: apiDoc.id,
    title: apiDoc.title,
    parcelId: apiDoc.parcel_id_str || (apiDoc.parcel_id ? String(apiDoc.parcel_id) : 'General'),
    projectId: apiDoc.project_code || 'NH-327',
    category: apiDoc.category,
    status: (apiDoc.verification_status as any) || 'Verified',
    fileSize: formatBytes(apiDoc.file_size_bytes),
    uploadedAt: apiDoc.created_at ? new Date(apiDoc.created_at).toLocaleDateString() : 'Today',
    storagePath: apiDoc.storage_path,
    mimeType: apiDoc.mime_type,
  }
}
