/**
 * Field Inspection API Service & Idempotent Offline Sync Engine for BhoomiSetu.
 * Reuses existing JWT Auth, FastAPI REST APIs, MinIO Document Storage, and IndexedDB.
 */

import { requestJson } from './client'
import { uploadDocumentFile } from './documents'
import {
  getOfflineInspections,
  getOfflinePhoto,
  removeOfflineInspection,
  updateOfflineInspectionStatus,
} from './indexedDB'

export interface NearbyParcelProperties {
  id: string
  parcel_id: string
  survey_number: string
  district: string
  project?: string
  acquisition_status: string
  land_area_ha: number
  land_type: string
  land_use: string
  baseline_risk_score: number
  risk_level?: string
  risk_score: number
  distance_m: number
  ui_x?: number
  ui_y?: number
}

export interface NearbyParcelFeature {
  type: 'Feature'
  geometry: Record<string, unknown>
  properties: NearbyParcelProperties
}

export interface GeoJSONNearbyCollection {
  type: 'FeatureCollection'
  features: NearbyParcelFeature[]
}

export interface ApiFieldInspectionCreate {
  client_inspection_id: string
  parcel_id: string
  gps_lat: number
  gps_lon: number
  verification_status: string
  boundary_intact: boolean
  encroachment_flag: boolean
  notes?: string
  photo_document_id?: string
  captured_at: string
}

export interface ApiFieldInspectionResponse {
  id: string
  client_inspection_id: string
  parcel_id: string
  inspector_id: string
  inspector_name?: string
  gps_lat: number
  gps_lon: number
  distance_to_parcel_m?: number
  verification_status: string
  boundary_intact: boolean
  encroachment_flag: boolean
  notes?: string
  photo_document_id?: string
  status: string
  captured_at: string
  created_at: string
}

/** Fetch PostGIS spatial distance-sorted parcels near surveyor GPS location */
export async function fetchNearbyParcels(
  lat: number,
  lon: number,
  radiusKm = 5,
  limit = 20,
): Promise<GeoJSONNearbyCollection> {
  const query = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    radius_km: radiusKm.toString(),
    limit: limit.toString(),
  }).toString()
  return requestJson<GeoJSONNearbyCollection>(`/api/v1/gis/parcels/nearby?${query}`)
}

/** Submit field inspection payload directly to FastAPI backend */
export async function submitFieldInspection(payload: ApiFieldInspectionCreate): Promise<ApiFieldInspectionResponse> {
  return requestJson<ApiFieldInspectionResponse>('/api/v1/inspections', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Retrieve field inspection history for a parcel */
export async function fetchParcelInspections(parcelId?: string) {
  const query = parcelId ? `?parcel_id=${parcelId}` : ''
  return requestJson<{ items: ApiFieldInspectionResponse[]; total: number }>(`/api/v1/inspections${query}`)
}

/**
 * Idempotent Offline Sync Engine:
 * Batch uploads queued IndexedDB inspections & photo blobs to FastAPI/MinIO.
 * Preserves immutable UUID client_inspection_id across retries.
 */
export async function syncOfflineInspections(
  onProgress?: (syncedCount: number, totalCount: number) => void,
): Promise<{ synced: number; failed: number }> {
  const records = await getOfflineInspections()
  const pendingRecords = records.filter((r) => r.sync_status !== 'SYNCED')

  if (pendingRecords.length === 0) {
    return { synced: 0, failed: 0 }
  }

  let syncedCount = 0
  let failedCount = 0

  for (const record of pendingRecords) {
    try {
      let photoDocId: string | undefined = undefined

      // 1. Idempotent Photo Upload to MinIO (if photo exists in IndexedDB)
      const photoRecord = await getOfflinePhoto(record.client_inspection_id)
      if (photoRecord) {
        const photoFile = new File([photoRecord.blob], photoRecord.file_name, { type: photoRecord.mime_type })
        const formData = new FormData()
        formData.append('file', photoFile)
        formData.append('title', `Field Survey Evidence · ${record.parcel_code || record.parcel_id}`)
        formData.append('project_id', record.project_id)
        formData.append('category', 'Field Evidence')
        formData.append('parcel_id', record.parcel_id)
        if (photoRecord.client_document_id) {
          formData.append('client_document_id', photoRecord.client_document_id)
        }

        const uploadedDoc = await uploadDocumentFile(formData)
        photoDocId = uploadedDoc.id
      }

      // 2. Idempotent Inspection Submission to FastAPI (immutable client_inspection_id UUID)
      const payload: ApiFieldInspectionCreate = {
        client_inspection_id: record.client_inspection_id,
        parcel_id: record.parcel_id,
        gps_lat: record.gps_lat,
        gps_lon: record.gps_lon,
        verification_status: record.verification_status,
        boundary_intact: record.boundary_intact,
        encroachment_flag: record.encroachment_flag,
        notes: record.notes,
        photo_document_id: photoDocId,
        captured_at: record.captured_at,
      }

      await submitFieldInspection(payload)

      // 3. Mark SYNCED and remove from local IndexedDB queue
      await updateOfflineInspectionStatus(record.client_inspection_id, 'SYNCED')
      await removeOfflineInspection(record.client_inspection_id)
      syncedCount++

      if (onProgress) {
        onProgress(syncedCount, pendingRecords.length)
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Network sync failed'
      await updateOfflineInspectionStatus(record.client_inspection_id, 'FAILED', errMsg)
      failedCount++
    }
  }

  return { synced: syncedCount, failed: failedCount }
}
