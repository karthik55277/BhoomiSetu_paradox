/**
 * Field Surveyor Mobile App Component (Phase 3.5).
 * Ground inspection interface with PostGIS spatial proximity search,
 * camera photo evidence upload to MinIO, IndexedDB offline sync queue with UUID idempotency,
 * and live WebSocket command center notifications.
 */

import React, { useEffect, useState } from 'react'
import {
  Compass,
  FileText,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  fetchNearbyParcels,
  getOfflineInspections,
  saveOfflineInspection,
  submitFieldInspection,
  syncOfflineInspections,
  uploadDocumentFile,
  type NearbyParcelFeature,
  type OfflineInspectionRecord,
} from '../api'
import type { UserProfile } from '../api/auth'

interface FieldAppProps {
  currentUser: UserProfile | null
  notify: (msg: string) => void
  onDisputeCreated?: () => void
}

const GPS_LOCATIONS = [
  { name: 'Patna Bypass (Sector 18)', lat: 25.6065, lon: 85.1265 },
  { name: 'Danapur Sector 4', lat: 25.6120, lon: 85.1370 },
  { name: 'Bihta Industrial Corridor', lat: 25.5965, lon: 85.1465 },
]

export const FieldApp: React.FC<FieldAppProps> = ({ currentUser, notify, onDisputeCreated }) => {
  // GPS & Environment State
  const [gpsMode, setGpsMode] = useState<'SIMULATED' | 'LIVE'>('SIMULATED')
  const [selectedGpsIdx, setSelectedGpsIdx] = useState(0)
  const [currentLat, setCurrentLat] = useState(GPS_LOCATIONS[0].lat)
  const [currentLon, setCurrentLon] = useState(GPS_LOCATIONS[0].lon)

  // Network State
  const [isDemoOffline, setIsDemoOffline] = useState(false)
  const [isBrowserOnline, setIsBrowserOnline] = useState(navigator.onLine)

  // Parcel & Inspection State
  const [nearbyParcels, setNearbyParcels] = useState<NearbyParcelFeature[]>([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [selectedParcel, setSelectedParcel] = useState<NearbyParcelFeature | null>(null)

  // Form State
  const [boundaryIntact, setBoundaryIntact] = useState(true)
  const [encroachmentFlag, setEncroachmentFlag] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState('Boundary Verified')
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Offline Queue State
  const [offlineQueue, setOfflineQueue] = useState<OfflineInspectionRecord[]>([])
  const [isSyncing, setIsSyncing] = useState(false)

  const effectiveOnline = isBrowserOnline && !isDemoOffline

  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true)
    const handleOffline = () => setIsBrowserOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadOfflineQueue = async () => {
    try {
      const records = await getOfflineInspections()
      setOfflineQueue(records)
    } catch {
      // ignore IDB errors in fallback
    }
  }

  useEffect(() => {
    loadOfflineQueue()
  }, [])

  // Fetch PostGIS nearby parcels when coordinates change
  useEffect(() => {
    if (!effectiveOnline) return
    setLoadingNearby(true)
    fetchNearbyParcels(currentLat, currentLon, 5, 10)
      .then((res) => {
        setNearbyParcels(res.features)
        if (res.features.length > 0 && !selectedParcel) {
          setSelectedParcel(res.features[0])
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'GPS nearby query failed'
        notify(`Nearby parcels error: ${msg}`)
      })
      .finally(() => setLoadingNearby(false))
  }, [currentLat, currentLon, effectiveOnline])

  const handleSelectGpsLocation = (idx: number) => {
    setSelectedGpsIdx(idx)
    setGpsMode('SIMULATED')
    setCurrentLat(GPS_LOCATIONS[idx].lat)
    setCurrentLon(GPS_LOCATIONS[idx].lon)
    notify(`Simulated GPS position updated: ${GPS_LOCATIONS[idx].name}`)
  }

  const handleUseLiveGps = () => {
    if (!navigator.geolocation) {
      notify('Geolocation is not supported by your browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsMode('LIVE')
        setCurrentLat(pos.coords.latitude)
        setCurrentLon(pos.coords.longitude)
        notify(`Live GPS Acquired: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`)
      },
      (err) => {
        notify(`Live GPS error: ${err.message}. Using simulated coordinates.`)
      },
    )
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedParcel) {
      notify('Please select a nearby parcel to inspect')
      return
    }

    setIsSubmitting(true)
    const clientInspectionId = crypto.randomUUID()
    const clientDocumentId = photoFile ? crypto.randomUUID() : undefined
    const capturedAtIso = new Date().toISOString()
    const props = selectedParcel.properties

    try {
      if (!effectiveOnline) {
        // --- OFFLINE WORKFLOW: Save to IndexedDB ---
        const offlineRecord: OfflineInspectionRecord = {
          client_inspection_id: clientInspectionId,
          client_document_id: clientDocumentId,
          parcel_id: props.id || props.parcel_id,
          parcel_code: props.parcel_id,
          project_id: 'NH-327', // Default or derived project
          gps_lat: currentLat,
          gps_lon: currentLon,
          verification_status: verificationStatus,
          boundary_intact: boundaryIntact,
          encroachment_flag: encroachmentFlag,
          notes: notes,
          photo_name: photoFile ? photoFile.name : undefined,
          sync_status: 'QUEUED',
          captured_at: capturedAtIso,
          created_at: new Date().toISOString(),
        }

        await saveOfflineInspection(offlineRecord, photoFile || undefined, photoFile?.name)
        await loadOfflineQueue()
        notify(`💾 Inspection saved offline in IndexedDB queue (UUID: ${clientInspectionId.slice(0, 8)}...)`)
      } else {
        // --- ONLINE WORKFLOW: Direct FastAPI + MinIO Upload ---
        let photoDocId: string | undefined = undefined
        if (photoFile) {
          const formData = new FormData()
          formData.append('file', photoFile)
          formData.append('title', `Field Survey Evidence · ${props.parcel_id}`)
          formData.append('project_id', 'NH-327')
          formData.append('category', 'Field Evidence')
          formData.append('parcel_id', props.id || props.parcel_id)
          if (clientDocumentId) {
            formData.append('client_document_id', clientDocumentId)
          }

          const docRes = await uploadDocumentFile(formData)
          photoDocId = docRes.id
        }

        await submitFieldInspection({
          client_inspection_id: clientInspectionId,
          parcel_id: props.id || props.parcel_id,
          gps_lat: currentLat,
          gps_lon: currentLon,
          verification_status: verificationStatus,
          boundary_intact: boundaryIntact,
          encroachment_flag: encroachmentFlag,
          notes: notes,
          photo_document_id: photoDocId,
          captured_at: capturedAtIso,
        })

        notify(`✅ Field inspection submitted for ${props.parcel_id} · Audit & WS Live!`)
      }

      // Reset form
      setNotes('')
      setPhotoFile(null)
      setPhotoPreview(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed'
      notify(`Inspection submit error: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSyncQueueNow = async () => {
    if (!effectiveOnline) {
      notify('Cannot sync while offline. Please restore network connection.')
      return
    }

    setIsSyncing(true)
    notify('🔄 Starting IndexedDB queue sync to FastAPI/MinIO...')
    try {
      const result = await syncOfflineInspections((synced, total) => {
        notify(`Sync progress: ${synced}/${total} items processed`)
      })

      await loadOfflineQueue()
      if (result.synced > 0) {
        notify(`🎉 Successfully synced ${result.synced} offline field inspection(s)!`)
        if (onDisputeCreated) onDisputeCreated()
      } else if (result.failed > 0) {
        notify(`⚠️ Sync encountered ${result.failed} failure(s). Check queue details.`)
      } else {
        notify('Queue is already up to date.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      notify(`Sync error: ${msg}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1080px', margin: '0 auto' }}>
      {/* Top Banner & Control Card */}
      <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Smartphone size={24} style={{ color: '#38bdf8' }} />
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#f8fafc' }}>BhoomiSetu Field Surveyor Mobile Interface</h2>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.88rem' }}>
              Ground inspection toolkit with PostGIS GPS spatial search, MinIO camera evidence upload, and IndexedDB offline queue.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className={`tag ${effectiveOnline ? 'tag-green' : 'tag-red'}`}
              style={{ padding: '6px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            >
              {effectiveOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {effectiveOnline ? 'NETWORK ONLINE' : 'DEMO OFFLINE MODE'}
            </span>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDemoOffline(!isDemoOffline)}
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
            >
              Toggle Demo Offline
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Left Column: GPS & Nearby Parcel Discovery */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
              <Navigation size={18} style={{ color: '#38bdf8' }} /> Surveyor GPS Location
            </h3>

            <div style={{ marginBottom: '14px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn ${gpsMode === 'SIMULATED' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setGpsMode('SIMULATED')}
                style={{ flex: 1, fontSize: '0.82rem' }}
              >
                SIMULATED GPS
              </button>
              <button
                type="button"
                className={`btn ${gpsMode === 'LIVE' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleUseLiveGps}
                style={{ flex: 1, fontSize: '0.82rem' }}
              >
                LIVE BROWSER GPS
              </button>
            </div>

            {gpsMode === 'SIMULATED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                <small style={{ color: '#94a3b8' }}>Select Simulated Corridor:</small>
                {GPS_LOCATIONS.map((loc, idx) => (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => handleSelectGpsLocation(idx)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: selectedGpsIdx === idx ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                      background: selectedGpsIdx === idx ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: selectedGpsIdx === idx ? '#38bdf8' : '#e2e8f0',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    📍 {loc.name} <small>({loc.lat.toFixed(4)}, {loc.lon.toFixed(4)})</small>
                  </button>
                ))}
              </div>
            )}

            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <div><strong>Active Latitude:</strong> {currentLat.toFixed(6)}</div>
              <div><strong>Active Longitude:</strong> {currentLon.toFixed(6)}</div>
              <div><strong>Jurisdiction Filter:</strong> {currentUser?.jurisdiction || 'Patna'}</div>
            </div>
          </div>

          {/* Nearby Parcels Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <Compass size={18} style={{ color: '#10b981' }} /> Nearby Parcels (PostGIS)
              </h3>
              {loadingNearby && <small style={{ color: '#38bdf8' }}>Searching...</small>}
            </div>

            {!effectiveOnline ? (
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '0.88rem' }}>
                🚫 Offline Mode active. Cached nearby parcels are available.
              </div>
            ) : nearbyParcels.length === 0 ? (
              <div style={{ padding: '16px', color: '#94a3b8', fontSize: '0.88rem' }}>
                No parcels found within 5 km of current GPS location.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                {nearbyParcels.map((feat) => {
                  const p = feat.properties
                  const isSelected = selectedParcel?.properties.parcel_id === p.parcel_id
                  return (
                    <div
                      key={p.parcel_id}
                      onClick={() => setSelectedParcel(feat)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: isSelected ? '#38bdf8' : '#f8fafc' }}>📍 {p.parcel_id}</strong>
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{p.distance_m}m away</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>
                        {p.survey_number} · {p.land_type} ({p.land_area_ha} ha)
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <span className={`tag ${p.risk_score > 70 ? 'tag-red' : p.risk_score > 40 ? 'tag-amber' : 'tag-green'}`}>
                          Risk Score: {Math.round(p.risk_score)}
                        </span>
                        <span className="tag">{p.acquisition_status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ground Inspection Form & Offline Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
              <FileText size={18} style={{ color: '#a855f7' }} /> Ground Inspection Form
            </h3>

            {selectedParcel ? (
              <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  <div style={{ fontSize: '0.85rem', color: '#e9d5ff' }}>
                    Inspecting Parcel: <strong>{selectedParcel.properties.parcel_id}</strong> ({selectedParcel.properties.survey_number})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#c084fc', marginTop: '2px' }}>
                    District: {selectedParcel.properties.district} · Distance from GPS: {selectedParcel.properties.distance_m}m
                  </div>
                </div>

                {/* Verification Checklist */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>Verification Status:</label>
                  <select
                    className="form-control"
                    value={verificationStatus}
                    onChange={(e) => setVerificationStatus(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="Boundary Verified">Boundary Verified</option>
                    <option value="Encroachment Detected">Encroachment Detected</option>
                    <option value="Dispute Escalated">Dispute Escalated</option>
                    <option value="Land Usage Verified">Land Usage Verified</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={boundaryIntact} onChange={(e) => setBoundaryIntact(e.target.checked)} />
                    Boundary Intact
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={encroachmentFlag} onChange={(e) => setEncroachmentFlag(e.target.checked)} />
                    Encroachment Flag
                  </label>
                </div>

                {/* Photo Camera Capture */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>Ground Photo Evidence (Camera):</label>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} style={{ fontSize: '0.85rem' }} />
                  {photoPreview && (
                    <div style={{ marginTop: '10px', textAlign: 'center' }}>
                      <img src={photoPreview} alt="Field preview" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }} />
                    </div>
                  )}
                </div>

                {/* Ground Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '6px' }}>Field Observations & Notes:</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Record land usage, physical markers, boundary disputes..."
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '10px' }}>
                  {effectiveOnline ? <Upload size={16} /> : <FileText size={16} />}
                  {isSubmitting ? 'Submitting...' : effectiveOnline ? 'Submit Live Inspection' : 'Save Offline in IndexedDB'}
                </button>
              </form>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                Select a nearby parcel on the left to begin ground inspection.
              </div>
            )}
          </div>

          {/* IndexedDB Offline Queue Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                <ShieldCheck size={18} style={{ color: '#f59e0b' }} /> IndexedDB Offline Queue ({offlineQueue.length})
              </h3>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSyncQueueNow}
                disabled={isSyncing || offlineQueue.length === 0}
                style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} className={isSyncing ? 'spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Sync Queue Now'}
              </button>
            </div>

            {offlineQueue.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>IndexedDB offline queue is currently empty.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {offlineQueue.map((item) => (
                  <div
                    key={item.client_inspection_id}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>📍 {item.parcel_code || item.parcel_id}</strong>
                      <span
                        className={`tag ${
                          item.sync_status === 'SYNCED'
                            ? 'tag-green'
                            : item.sync_status === 'SYNCING'
                            ? 'tag-amber'
                            : item.sync_status === 'FAILED'
                            ? 'tag-red'
                            : 'tag-amber'
                        }`}
                      >
                        {item.sync_status}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Status: {item.verification_status} · UUID: {item.client_inspection_id.slice(0, 8)}...
                    </div>
                    {item.error_message && <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '4px' }}>Error: {item.error_message}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
