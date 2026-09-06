/**
 * IndexedDB Offline Storage Service for BhoomiSetu Field Surveyor Mobile App.
 * Manages offline inspection metadata and camera photo binary blobs cleanly.
 */

export interface OfflineInspectionRecord {
  client_inspection_id: string
  client_document_id?: string
  parcel_id: string
  parcel_code?: string
  project_id: string
  gps_lat: number
  gps_lon: number
  verification_status: string
  boundary_intact: boolean
  encroachment_flag: boolean
  notes: string
  photo_name?: string
  sync_status: 'DRAFT' | 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED'
  error_message?: string
  captured_at: string
  created_at: string
}

export interface OfflinePhotoRecord {
  client_inspection_id: string
  client_document_id: string
  blob: Blob
  mime_type: string
  file_name: string
}

const DB_NAME = 'bhoomisetu_field_db'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('inspections')) {
        db.createObjectStore('inspections', { keyPath: 'client_inspection_id' })
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'client_inspection_id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveOfflineInspection(
  record: OfflineInspectionRecord,
  photoBlob?: Blob,
  fileName?: string,
): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['inspections', 'photos'], 'readwrite')
    const inspectionsStore = tx.objectStore('inspections')
    const photosStore = tx.objectStore('photos')

    inspectionsStore.put(record)

    if (photoBlob && record.client_document_id) {
      const photoRecord: OfflinePhotoRecord = {
        client_inspection_id: record.client_inspection_id,
        client_document_id: record.client_document_id,
        blob: photoBlob,
        mime_type: photoBlob.type || 'image/jpeg',
        file_name: fileName || `survey_photo_${Date.now()}.jpg`,
      }
      photosStore.put(photoRecord)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getOfflineInspections(): Promise<OfflineInspectionRecord[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readonly')
    const store = tx.objectStore('inspections')
    const request = store.getAll()

    request.onsuccess = () => resolve(request.result as OfflineInspectionRecord[])
    request.onerror = () => reject(request.error)
  })
}

export async function getOfflinePhoto(client_inspection_id: string): Promise<OfflinePhotoRecord | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly')
    const store = tx.objectStore('photos')
    const request = store.get(client_inspection_id)

    request.onsuccess = () => resolve((request.result as OfflinePhotoRecord) || null)
    request.onerror = () => reject(request.error)
  })
}

export async function updateOfflineInspectionStatus(
  client_inspection_id: string,
  sync_status: OfflineInspectionRecord['sync_status'],
  error_message?: string,
): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('inspections', 'readwrite')
    const store = tx.objectStore('inspections')
    const getReq = store.get(client_inspection_id)

    getReq.onsuccess = () => {
      const record = getReq.result as OfflineInspectionRecord
      if (record) {
        record.sync_status = sync_status
        if (error_message !== undefined) {
          record.error_message = error_message
        }
        store.put(record)
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeOfflineInspection(client_inspection_id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['inspections', 'photos'], 'readwrite')
    tx.objectStore('inspections').delete(client_inspection_id)
    tx.objectStore('photos').delete(client_inspection_id)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
