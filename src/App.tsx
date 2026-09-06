import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown, CircleHelp, Download, FileText, Layers, Landmark, LayoutDashboard, Map, Menu, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import {
  buildParcelRiskInput,
  createDocumentMetadata,
  explainRisk,
  fetchAuditEvents,
  fetchCompensations,
  fetchDisputes,
  fetchDocuments,
  fetchGisParcels,
  fetchParcelAiHistory,
  fetchParcelDetail,
  fetchParcels,
  fetchProjectByCode,
  fetchProjects,
  formatFeatureName,
  getNextCompensationStatus,
  mapApiCompensationToUi,
  mapApiDisputeToUi,
  mapApiDocumentToUi,
  mapApiAuditEventToUi,
  mapGisFeatureToParcel,
  updateCompensation,
  updateDispute,
  type ApiAiAnalysisRecord,
  type ApiGeoJSONFeature,
  type ApiParcelDetailResponse,
  type ApiProjectDetailResponse,
  type ParcelAnalysis,
  type ParcelAnalysisCache,
  type RiskPredictionResponse,
} from './api'
import { getRiskLabel, initialAuditEvents, initialCompensations, initialDisputes, initialDocuments, parcels, projects, stages, type AuditEvent, type CompensationRecord, type DisputeRecord, type DocumentRecord, type Parcel } from './data'
import './App.css'


type Icon = typeof LayoutDashboard
const navItems: [string, string, Icon][] = [
  ['Dashboard', '/dashboard', LayoutDashboard],
  ['GIS Map', '/gis', Map],
  ['Projects', '/projects', Landmark],
  ['Parcels', '/parcels', FileText],
  ['AI Engine', '/ai', Sparkles],
  ['Disputes', '/disputes', AlertTriangle],
  ['Compensation', '/compensation', Activity],
  ['Documents', '/documents', FileText],
  ['Audit Trail', '/audit', ShieldCheck],
  ['Analytics', '/analytics', Activity],
]

function navigate(path: string) {
  window.location.hash = path
}

function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/dashboard')
  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1) || '/dashboard')
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}

function Button({
  children,
  onClick,
  className = '',
  disabled = false,
  title,
  style,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  title?: string
  style?: React.CSSProperties
  type?: 'button' | 'submit' | 'reset'
}) {
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled} title={title} style={style}>
      {children}
    </button>
  )
}

function App() {
  const route = useRoute()
  const [selected, setSelected] = useState<Parcel>(parcels[0])
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [unread, setUnread] = useState(3)

  // Central Shared State
  const [aiCache, setAiCache] = useState<ParcelAnalysisCache>(() => {
    try {
      const saved = sessionStorage.getItem('bhoomisetu-ai-cache')
      return saved ? (JSON.parse(saved) as ParcelAnalysisCache) : {}
    } catch {
      return {}
    }
  })
  const [analyzingMap, setAnalyzingMap] = useState<Record<string, boolean>>({})

  // Session-persistent datasets
  const [disputes, setDisputes] = useState<DisputeRecord[]>(initialDisputes)
  const [compensations, setCompensations] = useState<CompensationRecord[]>(initialCompensations)
  const [documents, setDocuments] = useState<DocumentRecord[]>(initialDocuments)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(initialAuditEvents)
  const [selectedProjectTab, setSelectedProjectTab] = useState<Record<string, string>>({})
  const [gisLayers, setGisLayers] = useState({
    landBoundary: true,
    riverBuffer: true,
    roadCorridor: true,
    highRiskOverlay: true,
  })

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  useEffect(() => {
    fetchDisputes()
      .then((res) => setDisputes(res.items.map(mapApiDisputeToUi)))
      .catch(() => {})

    fetchCompensations()
      .then((res) => setCompensations(res.items.map(mapApiCompensationToUi)))
      .catch(() => {})

    fetchDocuments()
      .then((res) => setDocuments(res.items.map(mapApiDocumentToUi)))
      .catch(() => {})

    fetchAuditEvents()
      .then((res) => setAuditEvents(res.items.map(mapApiAuditEventToUi)))
      .catch(() => {})
  }, [])

  // Central AI Fetcher with Shared Cache
  const getOrFetchParcelAnalysis = async (parcel: Parcel, forceRefresh = false): Promise<ParcelAnalysis> => {
    if (!forceRefresh && aiCache[parcel.id]) {
      return aiCache[parcel.id]
    }

    setAnalyzingMap((prev) => ({ ...prev, [parcel.id]: true }))
    try {
      const payload = buildParcelRiskInput(parcel)
      const explanation = await explainRisk(payload, 5, parcel.id)
      const prediction: RiskPredictionResponse = {
        risk_score: explanation.risk_score,
        risk_level: explanation.risk_level,
        risk_probability: explanation.risk_probability,
        acquisition_risk: explanation.acquisition_risk,
        model_version: explanation.model_version,
        analysis_id: explanation.analysis_id,
        persisted_at: explanation.persisted_at,
        is_persisted: explanation.is_persisted ?? true,
      }

      const analysisResult: ParcelAnalysis = {
        prediction,
        explanation,
        timestamp: Date.now(),
      }

      setAiCache((prev) => {
        const next = { ...prev, [parcel.id]: analysisResult }
        try {
          sessionStorage.setItem('bhoomisetu-ai-cache', JSON.stringify(next))
        } catch {
          // ignore session storage quotas
        }
        return next
      })

      // Add to audit trail
      const auditItem: AuditEvent = {
        id: `AUD-${Date.now().toString().slice(-4)}`,
        title: `AI risk evaluation completed for ${parcel.id}`,
        parcelId: parcel.id,
        projectId: parcel.project,
        actor: 'Anil Kumar (District Officer)',
        timestamp: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} IST`,
        payloadHash: Math.random().toString(16).substring(2, 14),
        status: 'VERIFIED',
      }
      setAuditEvents((prev) => [auditItem, ...prev])

      notify(`${parcel.id} analysis complete · ${prediction.risk_level} risk score (${Math.round(prediction.risk_score)})`)
      return analysisResult
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI analysis failed'
      notify(`Analysis error for ${parcel.id}: ${msg}`)
      throw error
    } finally {
      setAnalyzingMap((prev) => ({ ...prev, [parcel.id]: false }))
    }
  }

  const routeBase = route.split('/')[1] ? `/${route.split('/')[1]}` : '/dashboard'

  // Global Search Logic
  const searchResults = useMemo(() => {
    if (search.trim().length <= 1) return []
    const query = search.toLowerCase()

    const parcelMatches = parcels
      .filter((p) => `${p.id} ${p.survey} ${p.owner} ${p.district} ${p.project}`.toLowerCase().includes(query))
      .map((p) => ({ type: 'parcel' as const, id: p.id, title: p.id, subtitle: `${p.district} · ${p.owner} · Survey ${p.survey}`, data: p }))

    const projectMatches = projects
      .filter((p) => `${p.id} ${p.name} ${p.type}`.toLowerCase().includes(query))
      .map((p) => ({ type: 'project' as const, id: p.id, title: p.id, subtitle: `${p.name} (${p.type})`, data: p }))

    const disputeMatches = disputes
      .filter((d) => `${d.id} ${d.parcelId} ${d.category} ${d.assignedTo}`.toLowerCase().includes(query))
      .map((d) => ({ type: 'dispute' as const, id: d.id, title: d.id, subtitle: `${d.category} · ${d.parcelId} · ${d.status}`, data: d }))

    return [...parcelMatches, ...projectMatches, ...disputeMatches]
  }, [search, disputes])

  const openParcel = (parcel: Parcel) => {
    setSelected(parcel)
    navigate(`/parcels/${parcel.id}`)
  }

  const handleSearchResultSelect = (result: (typeof searchResults)[0]) => {
    setSearch('')
    if (result.type === 'parcel') {
      openParcel(result.data as Parcel)
    } else if (result.type === 'project') {
      navigate(`/projects/${result.id}`)
      notify(`Navigated to project ${result.id}`)
    } else if (result.type === 'dispute') {
      navigate(`/disputes/${result.id}`)
      notify(`Navigated to dispute ${result.id}`)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Landmark size={18} />
          </span>
          <span>
            Bhoomi<span>Setu</span>
          </span>
        </div>
        <div className="workspace-label">
          NATIONAL LAND INTELLIGENCE <span>DEMO</span>
        </div>
        <nav>
          {navItems.map(([label, path, Icon]) => (
            <Button key={path} className={routeBase === path ? 'nav-item active' : 'nav-item'} onClick={() => navigate(path)}>
              <Icon size={16} />
              <span>{label}</span>
              {label === 'Disputes' && <b>{disputes.filter((d) => d.status !== 'Resolved').length}</b>}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button className="nav-item" onClick={() => navigate('/settings')}>
            <Settings size={16} />
            <span>Settings</span>
          </Button>
          <Button className="nav-item" onClick={() => notify('Help Center: Contact support at support@bhoomisetu.gov.in')}>
            <CircleHelp size={16} />
            <span>Help center</span>
          </Button>
          <div className="user-mini">
            <div className="avatar">AK</div>
            <div>
              <strong>Anil Kumar</strong>
              <small>District Officer</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <Button className="mobile-menu" onClick={() => notify('Mobile navigation: Use sidebar links')}>
            <Menu size={20} />
          </Button>
          <div className="global-search">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parcel ID, survey, project, owner, dispute..." aria-label="Global search" />
            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((r) => (
                  <Button key={r.id} onClick={() => handleSearchResultSelect(r)}>
                    <strong>
                      {r.type === 'parcel' ? '📍' : r.type === 'project' ? '📁' : '⚖️'} {r.title}
                    </strong>
                    <span>{r.subtitle}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <div className="demo-badge">
              <span></span> Seeded demo data
            </div>
            <Button
              className="icon-button"
              onClick={() => {
                setUnread(0)
                notify('All notifications marked as read')
              }}
              title="Notifications"
            >
              <Bell size={18} />
              {unread > 0 && <i>{unread}</i>}
            </Button>
            <Button className="profile-button" onClick={() => setMenuOpen(!menuOpen)}>
              <div className="avatar">AK</div>
              <ChevronDown size={14} />
            </Button>
          </div>
          {menuOpen && (
            <div className="profile-menu">
              <strong>Anil Kumar</strong>
              <small>District Officer · Patna</small>
              <Button
                onClick={() => {
                  notify('Profile view: District Officer · Patna Zone')
                  setMenuOpen(false)
                }}
              >
                Profile
              </Button>
              <Button
                onClick={() => {
                  navigate('/settings')
                  setMenuOpen(false)
                }}
              >
                Preferences
              </Button>
              <Button
                onClick={() => {
                  navigate('/audit')
                  setMenuOpen(false)
                }}
              >
                Activity log
              </Button>
              <Button
                onClick={() => {
                  notify('Signed out of demo session')
                  setMenuOpen(false)
                }}
              >
                Sign out
              </Button>
            </div>
          )}
        </header>

        <div className="content-wrap">
          <Page
            route={route}
            selected={selected}
            setSelected={setSelected}
            openParcel={openParcel}
            notify={notify}
            navigate={navigate}
            aiCache={aiCache}
            getOrFetchParcelAnalysis={getOrFetchParcelAnalysis}
            analyzingMap={analyzingMap}
            disputes={disputes}
            compensations={compensations}
            documents={documents}
            auditEvents={auditEvents}
            gisLayers={gisLayers}
            setGisLayers={setGisLayers}
            selectedProjectTab={selectedProjectTab}
            setSelectedProjectTab={setSelectedProjectTab}
          />
        </div>
      </main>
      {toast && (
        <div className="toast">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}
    </div>
  )
}

function Page({
  route,
  selected,
  setSelected,
  openParcel,
  notify,
  navigate,
  aiCache,
  getOrFetchParcelAnalysis,
  analyzingMap,
  disputes,
  compensations,
  documents,
  auditEvents,
  gisLayers,
  setGisLayers,
  selectedProjectTab,
  setSelectedProjectTab,
}: {
  route: string
  selected: Parcel
  setSelected: (p: Parcel) => void
  openParcel: (p: Parcel) => void
  notify: (s: string) => void
  navigate: (s: string) => void
  aiCache: ParcelAnalysisCache
  getOrFetchParcelAnalysis: (p: Parcel, force?: boolean) => Promise<ParcelAnalysis>
  analyzingMap: Record<string, boolean>
  disputes: DisputeRecord[]
  compensations: CompensationRecord[]
  documents: DocumentRecord[]
  auditEvents: AuditEvent[]
  gisLayers: { landBoundary: boolean; riverBuffer: boolean; roadCorridor: boolean; highRiskOverlay: boolean }
  setGisLayers: React.Dispatch<React.SetStateAction<{ landBoundary: boolean; riverBuffer: boolean; roadCorridor: boolean; highRiskOverlay: boolean }>>
  selectedProjectTab: Record<string, string>
  setSelectedProjectTab: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  if (route.startsWith('/parcels/')) {
    const parcelId = route.split('/')[2]
    const parcel = parcels.find((p) => p.id === parcelId) || selected
    return <ParcelProfile parcel={parcel} navigate={navigate} aiCache={aiCache} getOrFetchParcelAnalysis={getOrFetchParcelAnalysis} isAnalyzing={!!analyzingMap[parcel.id]} />
  }
  if (route === '/parcels') return <ParcelList openParcel={openParcel} aiCache={aiCache} />
  if (route === '/gis') return <GIS selected={selected} setSelected={setSelected} openParcel={openParcel} notify={notify} aiCache={aiCache} getOrFetchParcelAnalysis={getOrFetchParcelAnalysis} isAnalyzing={!!analyzingMap[selected.id]} gisLayers={gisLayers} setGisLayers={setGisLayers} />
  if (route === '/ai') return <AI notify={notify} navigate={navigate} aiCache={aiCache} getOrFetchParcelAnalysis={getOrFetchParcelAnalysis} analyzingMap={analyzingMap} />
  if (route.startsWith('/projects/')) {
    const projId = route.split('/')[2]
    const project = projects.find((p) => p.id === projId) || projects[0]
    return (
      <ProjectDetail
        project={project}
        notify={notify}
        navigate={navigate}
        openParcel={openParcel}
        aiCache={aiCache}
        disputes={disputes}
        documents={documents}
        auditEvents={auditEvents}
        selectedProjectTab={selectedProjectTab}
        setSelectedProjectTab={setSelectedProjectTab}
      />
    )
  }
  if (route === '/projects') return <Projects notify={notify} navigate={navigate} />
  if (route.startsWith('/disputes/')) {
    const dispId = route.split('/')[2]
    return <DisputeDetail disputeId={dispId} notify={notify} navigate={navigate} />
  }
  if (route === '/disputes') return <DisputesView notify={notify} navigate={navigate} />
  if (route === '/compensation') return <CompensationView notify={notify} />
  if (route === '/documents') return <DocumentsView notify={notify} />
  if (route === '/audit') return <AuditView />
  if (route === '/analytics') return <AnalyticsView aiCache={aiCache} disputes={disputes} compensations={compensations} />
  if (route === '/settings') return <SettingsView notify={notify} />
  return <Dashboard navigate={navigate} openParcel={openParcel} aiCache={aiCache} disputes={disputes} compensations={compensations} auditEvents={auditEvents} />
}

function Heading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="subheading">{subtitle}</p>
      </div>
      {action}
    </section>
  )
}

function Dashboard({
  navigate,
  openParcel,
  aiCache,
  disputes,
  compensations,
  auditEvents,
}: {
  navigate: (s: string) => void
  openParcel: (p: Parcel) => void
  aiCache: ParcelAnalysisCache
  disputes: DisputeRecord[]
  compensations: CompensationRecord[]
  auditEvents: AuditEvent[]
}) {
  const highRiskCount = parcels.filter((p) => {
    const cached = aiCache[p.id]
    const score = cached ? cached.prediction.risk_score : p.risk
    return score > 60
  }).length

  const openDisputeCount = disputes.filter((d) => d.status !== 'Resolved').length
  const totalComp = compensations.reduce((acc, c) => acc + c.rawAmount, 0)
  const totalCompFormatted = `Rs ${(totalComp / 10000000).toFixed(1)} Cr`

  const kpiData: [string, string | number, string, string][] = [
    ['Projects', projects.length, '/projects', 'teal'],
    ['Parcels', parcels.length, '/parcels', 'amber'],
    ['High risk', highRiskCount, '/gis', 'red'],
    ['Disputes', openDisputeCount, '/disputes', 'violet'],
    ['Compensation', totalCompFormatted, '/compensation', 'blue'],
  ]

  const priorityParcel = parcels.find((p) => p.id === 'BR-042-0187') || parcels[0]

  return (
    <>
      <Heading eyebrow="SEPTEMBER 2026 · PATNA DISTRICT OPERATIONS" title="Good morning, Officer" subtitle={`${disputes.length} disputes and ${highRiskCount} high-risk parcels require attention in Patna.`} action={<Button className="primary-button" onClick={() => navigate('/projects')}>+ View Projects</Button>} />
      <section className="kpi-grid">
        {kpiData.map(([label, value, path, color]) => (
          <Button key={label} className="kpi-card" onClick={() => navigate(path)}>
            <span className={`kpi-icon ${color}`}>
              <Activity size={16} />
            </span>
            <span className="kpi-label">{label}</span>
            <strong>{value}</strong>
            <small>{label === 'High risk' ? 'Requires review' : label === 'Disputes' ? `${openDisputeCount} open` : 'Active scope'}</small>
          </Button>
        ))}
      </section>

      <div className="attention-strip">
        <AlertTriangle size={17} />
        <div>
          <strong>Priority attention</strong>
          <span>BR-042-0187 has a high acquisition risk score and an open boundary dispute.</span>
        </div>
        <Button onClick={() => openParcel(priorityParcel)}>
          Review parcel <ArrowRight size={14} />
        </Button>
      </div>

      <section className="dashboard-grid">
        <div className="panel map-panel">
          <div className="panel-head">
            <div>
              <h3>Live GIS map overview</h3>
              <p>{parcels.length} candidate parcels in scope · Click a parcel to inspect</p>
            </div>
            <Button className="quiet-button" onClick={() => navigate('/gis')}>
              Open GIS Command <ArrowRight size={14} />
            </Button>
          </div>
          <MiniMap openParcel={openParcel} aiCache={aiCache} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>What needs attention</h3>
              <p>Actionable items for District Officer</p>
            </div>
          </div>
          <div className="attention-list">
            <Button onClick={() => openParcel(priorityParcel)}>
              <span className="risk-pill high">HIGH</span>
              <div>
                <strong>Ownership objection</strong>
                <small>BR-042-0187 · Due today</small>
              </div>
              <ArrowRight size={14} />
            </Button>
            <Button onClick={() => navigate('/disputes')}>
              <span className="risk-pill medium">{openDisputeCount}</span>
              <div>
                <strong>Open disputes</strong>
                <small>{disputes.filter((d) => d.status === 'Escalated').length} escalated for review</small>
              </div>
              <ArrowRight size={14} />
            </Button>
            <Button onClick={() => navigate('/compensation')}>
              <span className="risk-pill info">{compensations.length}</span>
              <div>
                <strong>Payments pending</strong>
                <small>{totalCompFormatted} across projects</small>
              </div>
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </section>

      <div className="panel activity-panel">
        <div className="panel-head">
          <div>
            <h3>Recent activity stream</h3>
            <p>Demo audit chain events recorded in current session</p>
          </div>
          <Button className="quiet-button" onClick={() => navigate('/audit')}>
            View full audit trail <ArrowRight size={14} />
          </Button>
        </div>
        <div className="activity-list">
          {auditEvents.slice(0, 3).map((event) => (
            <ActivityRow key={event.id} icon={event.title.includes('AI') ? <Sparkles size={14} /> : event.title.includes('Objection') ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />} text={event.title} meta={`${event.actor} · ${event.timestamp}`} />
          ))}
        </div>
      </div>
    </>
  )
}

function ActivityRow({ icon, text, meta }: { icon: React.ReactNode; text: string; meta: string }) {
  return (
    <div className="activity-row">
      <span>{icon}</span>
      <p>
        <strong>{text}</strong>
        <small>{meta}</small>
      </p>
    </div>
  )
}

function MiniMap({ openParcel, aiCache }: { openParcel: (p: Parcel) => void; aiCache: ParcelAnalysisCache }) {
  return (
    <div className="map-canvas mini-map">
      <div className="map-label">Ganga river</div>
      <div className="road road-a"></div>
      <div className="road road-b"></div>
      {parcels.map((p) => {
        const cached = aiCache[p.id]
        const score = cached ? Math.round(cached.prediction.risk_score) : p.risk
        const color = score > 60 ? '#d8634d' : score > 30 ? '#e9a23b' : '#54a884'
        return (
          <button key={p.id} aria-label={`Open ${p.id}`} className="parcel" style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }} onClick={() => openParcel(p)}>
            <span>{score}</span>
          </button>
        )
      })}
      <div className="map-legend">
        <span>
          <i className="dot green"></i>Low
        </span>
        <span>
          <i className="dot orange"></i>Medium
        </span>
        <span>
          <i className="dot red"></i>High
        </span>
      </div>
    </div>
  )
}

function GIS({
  selected,
  setSelected,
  openParcel,
  notify,
  aiCache,
  getOrFetchParcelAnalysis,
  isAnalyzing,
  gisLayers,
  setGisLayers,
}: {
  selected: Parcel
  setSelected: (p: Parcel) => void
  openParcel: (p: Parcel) => void
  notify: (s: string) => void
  aiCache: ParcelAnalysisCache
  getOrFetchParcelAnalysis: (p: Parcel, force?: boolean) => Promise<ParcelAnalysis>
  isAnalyzing: boolean
  gisLayers: { landBoundary: boolean; riverBuffer: boolean; roadCorridor: boolean; highRiskOverlay: boolean }
  setGisLayers: React.Dispatch<React.SetStateAction<{ landBoundary: boolean; riverBuffer: boolean; roadCorridor: boolean; highRiskOverlay: boolean }>>
}) {
  const [query, setQuery] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [showLayerModal, setShowLayerModal] = useState(false)

  // Phase 2.5.2 GIS Live API states
  const [liveFeatures, setLiveFeatures] = useState<ApiGeoJSONFeature[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true)
  const [bbox, setBbox] = useState<string>('85.10,25.55,85.15,25.65')

  // Debounced live GIS spatial fetch from PostGIS API (triggered only by bbox and riskOnly)
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)

      fetchGisParcels({
        bbox,
        risk_level: riskOnly ? 'High' : undefined,
        limit: 100,
      })
        .then((geoJson) => {
          if (isMounted) {
            setLiveFeatures(geoJson.features)
            setIsLiveMode(true)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Unable to connect to live PostGIS spatial API.')
            setIsLiveMode(false)
            setLoading(false)
          }
        })
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [bbox, riskOnly])

  // Derive parcel objects strictly from Live PostGIS GeoJSON features or Demo Fallback
  const liveParcels = useMemo(() => {
    if (!isLiveMode || liveFeatures.length === 0) return []
    return liveFeatures.map((feat) => {
      const p = mapGisFeatureToParcel(feat)
      // Extract coordinates from GeoJSON geometry if ui_x/ui_y missing
      if (p.x === 50 && p.y === 50 && feat.geometry && feat.geometry.coordinates) {
        try {
          const coords = feat.geometry.coordinates[0]
          if (Array.isArray(coords) && coords.length > 0) {
            const lons = coords.map((c: number[]) => c[0])
            const lats = coords.map((c: number[]) => c[1])
            const avgLon = lons.reduce((a: number, b: number) => a + b, 0) / lons.length
            const avgLat = lats.reduce((a: number, b: number) => a + b, 0) / lats.length
            p.x = Math.max(10, Math.min(90, Math.round(((avgLon - 85.10) / 0.05) * 100)))
            p.y = Math.max(10, Math.min(90, Math.round((1 - (avgLat - 25.55) / 0.10) * 100)))
          }
        } catch {
          // Keep default fallback
        }
      }
      return p
    })
  }, [isLiveMode, liveFeatures])

  const shown = isLiveMode && liveParcels.length > 0
    ? liveParcels.filter((p) => {
        const cached = aiCache[p.id]
        const score = cached ? cached.prediction.risk_score : p.risk
        const matchesRisk = !riskOnly || score > 60
        const matchesSearch = `${p.id} ${p.survey} ${p.owner}`.toLowerCase().includes(query.toLowerCase())
        return matchesRisk && matchesSearch
      })
    : parcels.filter((p) => {
        const cached = aiCache[p.id]
        const score = cached ? cached.prediction.risk_score : p.risk
        const matchesRisk = !riskOnly || score > 60
        const matchesSearch = `${p.id} ${p.survey} ${p.owner}`.toLowerCase().includes(query.toLowerCase())
        return matchesRisk && matchesSearch
      })

  const currentAnalysis = aiCache[selected.id]

  const runGISAnalysis = async () => {
    try {
      await getOrFetchParcelAnalysis(selected, true)
    } catch {
      // Handled in helper
    }
  }

  const exportView = () => {
    const summary = `BHOOMISETU GIS EXPORT REPORT\nDate: ${new Date().toLocaleDateString()}\nData Source: ${isLiveMode ? 'PostgreSQL PostGIS Live Spatial Engine' : 'Demo Fallback Data'}\nViewport BBOX: ${bbox}\nParcel: ${selected.id}\nDistrict: ${selected.district}\nArea: ${selected.area}\nLand Use: ${selected.landUse}\nRisk Score: ${currentAnalysis ? currentAnalysis.prediction.risk_score : selected.risk} / 100\nRisk Level: ${currentAnalysis ? currentAnalysis.prediction.risk_level : getRiskLabel(selected.risk)}\n`
    const blob = new Blob([summary], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GIS_Export_${selected.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
    notify(`Export report generated for ${selected.id}`)
  }

  return (
    <>
      <Heading
        eyebrow={`SPATIAL OPERATIONS · ${isLiveMode ? 'POSTGIS LIVE API' : 'FALLBACK MODE'}`}
        title="GIS Command Center"
        subtitle={`India / Bihar / Patna / NH-327 Ring Road · BBOX: [${bbox}]`}
        action={
          <Button className="primary-button" onClick={exportView}>
            <Download size={14} /> Export view
          </Button>
        }
      />

      <div className="gis-toolbar">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parcel ID, survey number or owner..." />
        </div>
        <Button className={riskOnly ? 'toggle active' : 'toggle'} onClick={() => setRiskOnly(!riskOnly)}>
          <span></span> High risk only
        </Button>
        <Button className="toggle" onClick={() => setShowLayerModal(!showLayerModal)}>
          <Layers size={15} /> Layers ({Object.values(gisLayers).filter(Boolean).length}/4)
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', fontSize: '11px' }}>
          <span className="muted font-mono">Viewport BBOX:</span>
          <select
            value={bbox}
            onChange={(e) => setBbox(e.target.value)}
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #c5d4cd',
              background: '#ffffff',
              color: '#294b55',
              fontWeight: 600,
            }}
          >
            <option value="85.10,25.55,85.15,25.65">Patna NH-327 BBOX (85.10,25.55)</option>
            <option value="85.00,25.50,85.30,25.75">Extended District BBOX (85.00,25.50)</option>
            <option value="84.50,25.00,86.00,26.50">Bihar Regional BBOX (84.50,25.00)</option>
          </select>
        </div>
      </div>

      {showLayerModal && (
        <div className="panel" style={{ padding: '14px 19px', marginBottom: '14px', background: '#f8faf9', border: '1px solid #dbe8e1' }}>
          <strong style={{ fontSize: '11px', color: '#294b55', display: 'block', marginBottom: '8px' }}>GIS Spatial Layer Controls</strong>
          <div style={{ display: 'flex', gap: '20px', fontSize: '10px', color: '#557074' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={gisLayers.landBoundary} onChange={(e) => setGisLayers((prev) => ({ ...prev, landBoundary: e.target.checked }))} /> Land Boundary Layer
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={gisLayers.riverBuffer} onChange={(e) => setGisLayers((prev) => ({ ...prev, riverBuffer: e.target.checked }))} /> River Buffer Zone
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={gisLayers.roadCorridor} onChange={(e) => setGisLayers((prev) => ({ ...prev, roadCorridor: e.target.checked }))} /> Road Accessibility Corridor
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={gisLayers.highRiskOverlay} onChange={(e) => setGisLayers((prev) => ({ ...prev, highRiskOverlay: e.target.checked }))} /> High Risk Heatmap
            </label>
          </div>
        </div>
      )}

      {loading && (
        <div className="panel" style={{ padding: '10px 16px', marginBottom: '12px', background: '#f5faf7', border: '1px solid #cce5d8' }}>
          <small className="muted font-mono">Querying PostGIS spatial database for BBOX [{bbox}]...</small>
        </div>
      )}

      {!isLiveMode && error && (
        <div className="panel" style={{ padding: '10px 16px', background: '#fdf3f2', border: '1px solid #f5c6cb', color: '#721c24', marginBottom: '12px' }}>
          <small>
            <strong>DEMO FALLBACK MODE:</strong> {error} Displaying static fallback parcels.
          </small>
        </div>
      )}

      <section className="gis-layout">
        <div className="panel gis-hero">
          <div className="panel-head">
            <div>
              <h3>Live parcel spatial view</h3>
              <p>
                {shown.length} parcels visible · {isLiveMode ? 'Sourced from PostGIS GeoJSON' : 'Fallback demo mode'} · Click a marker to select
              </p>
            </div>
            <span className={`live-label ${isLiveMode ? '' : 'offline'}`} style={isLiveMode ? {} : { background: '#f5c6cb', color: '#721c24' }}>
              <i></i> {isLiveMode ? 'POSTGIS LIVE' : 'DEMO FALLBACK'}
            </span>
          </div>

          <div className="map-canvas operational-map">
            {gisLayers.riverBuffer && <div className="map-label">Ganga river buffer</div>}
            {gisLayers.roadCorridor && (
              <>
                <div className="road road-a"></div>
                <div className="road road-b"></div>
                <div className="road road-c"></div>
              </>
            )}
            {gisLayers.landBoundary && (
              <>
                <div className="map-boundary boundary-one"></div>
                <div className="map-boundary boundary-two"></div>
              </>
            )}

            {shown.map((p) => {
              const cached = aiCache[p.id]
              const score = cached ? Math.round(cached.prediction.risk_score) : p.risk
              const color = score > 60 ? '#d8634d' : score > 30 ? '#e9a23b' : '#54a884'

              return (
                <button key={p.id} aria-label={`Select parcel ${p.id}`} className={selected.id === p.id ? 'parcel selected' : 'parcel'} style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }} onClick={() => setSelected(p)}>
                  <span>{score}</span>
                </button>
              )
            })}

            <div className="map-legend">
              <span>
                <i className="dot green"></i>Low risk
              </span>
              <span>
                <i className="dot orange"></i>Medium
              </span>
              <span>
                <i className="dot red"></i>High / critical
              </span>
            </div>
          </div>
        </div>

        <div className="panel gis-side">
          <div className="panel-head">
            <div>
              <p className="eyebrow">SELECTED PARCEL</p>
              <h3>{selected.id}</h3>
            </div>
            <span className={`risk-pill ${currentAnalysis ? (currentAnalysis.prediction.risk_score > 60 ? 'high' : 'medium') : selected.risk > 60 ? 'high' : 'medium'}`}>
              {currentAnalysis ? currentAnalysis.prediction.risk_level : getRiskLabel(selected.risk)}
            </span>
          </div>

          <div className="gis-stats">
            <div>
              <small>ML Risk Score</small>
              <strong className={currentAnalysis ? (currentAnalysis.prediction.risk_score > 60 ? 'risk-high' : 'risk-low') : 'risk-high'}>
                {currentAnalysis ? Math.round(currentAnalysis.prediction.risk_score) : selected.risk}/100
              </strong>
            </div>
            <div>
              <small>Suitability (Seeded)</small>
              <strong className="risk-low">{selected.suitability}/100</strong>
            </div>
            <div>
              <small>Estimated Delay</small>
              <strong>{selected.delay}</strong>
            </div>
          </div>

          <div className="reason-list">
            <strong>{currentAnalysis ? 'Top ML SHAP Contributors' : 'Initial Risk Parameters'}</strong>
            {currentAnalysis && currentAnalysis.explanation.contributors.length > 0 ? (
              currentAnalysis.explanation.contributors.slice(0, 4).map((c, i) => (
                <span key={i}>
                  {formatFeatureName(c.feature)} <b className={c.impact >= 0 ? '' : 'negative'}>{c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(2)}</b>
                </span>
              ))
            ) : (
              <>
                <span>Ownership complexity (Seeded) <b>+21.0</b></span>
                <span>Previous objection (Seeded) <b>+19.0</b></span>
                <span>Compensation exposure (Seeded) <b>+15.0</b></span>
                <p style={{ fontSize: '9px', color: '#97a6a5', margin: '4px 0 0' }}>Click below to compute real ML SHAP values.</p>
              </>
            )}
          </div>

          <Button className="primary-button full-button" onClick={runGISAnalysis} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analyzing ML Model...' : currentAnalysis ? 'Re-run ML Analysis' : 'Run Full Analysis'} <Sparkles size={14} />
          </Button>

          <Button className="outline-button full-button" onClick={() => openParcel(selected)}>
            Open Parcel Profile <ArrowRight size={14} />
          </Button>
        </div>
      </section>
    </>
  )
}

function ParcelList({ openParcel, aiCache }: { openParcel: (p: Parcel) => void; aiCache: ParcelAnalysisCache }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [riskFilter, setRiskFilter] = useState('All risk levels')
  const [liveParcels, setLiveParcels] = useState<Parcel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    fetchParcels({
      search: query.trim() || undefined,
      acquisition_status: statusFilter !== 'All statuses' ? statusFilter : undefined,
      risk_level: riskFilter !== 'All risk levels' ? riskFilter : undefined,
    })
      .then(({ ui }) => {
        if (isMounted) {
          setLiveParcels(ui)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load live parcels.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [query, statusFilter, riskFilter])

  const shown = liveParcels.length > 0 || loading || error ? liveParcels : parcels

  return (
    <>
      <Heading title="Land Parcels" subtitle="Search, filter, and inspect parcels across active acquisition scope." action={<Button className="primary-button" onClick={() => openParcel(shown[0] || parcels[0])}>Inspect Selected Parcel</Button>} />
      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parcel ID, survey number, or owner..." />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All statuses</option>
          {['Under review', 'Notice issued', 'Survey', 'Identified', 'Objection'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option>All risk levels</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="panel" style={{ padding: '14px 20px', background: '#fdf3f2', border: '1px solid #f5c6cb', color: '#721c24', marginBottom: '14px' }}>
          <strong>API Connection Notice:</strong> {error} Showing offline parcel cache.
        </div>
      )}

      <div className="panel table-panel">
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#557074' }}>
            <span>Loading parcels from live database...</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Parcel ID & Survey</th>
                <th>District</th>
                <th>Area</th>
                <th>Risk Score</th>
                <th>Acquisition Status</th>
                <th>Primary Owner</th>
                <th>AI Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const cached = aiCache[p.id]
                const score = cached ? Math.round(cached.prediction.risk_score) : p.risk
                const label = cached ? cached.prediction.risk_level : getRiskLabel(p.risk)

                return (
                  <tr key={p.id} onClick={() => openParcel(p)}>
                    <td>
                      <strong>{p.id}</strong>
                      <small>{p.survey}</small>
                    </td>
                    <td>{p.district || 'Patna'}</td>
                    <td>{p.area}</td>
                    <td>
                      <span className={`risk-pill ${score > 60 ? 'high' : score > 30 ? 'medium' : 'low'}`}>
                        {score} {label}
                      </span>
                    </td>
                    <td>{p.status}</td>
                    <td>{p.owner}</td>
                    <td>
                      <span style={{ fontSize: '9px', color: cached ? '#4c997b' : '#889896', fontWeight: 600 }}>{cached ? '✓ Analyzed' : 'Live DB'}</span>
                    </td>
                    <td>
                      <ArrowRight size={15} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!loading && shown.length === 0 && (
          <div className="empty-state">
            <Search size={22} />
            <strong>No parcels matched your query</strong>
            <span>Try resetting search terms or risk filters.</span>
          </div>
        )}
      </div>
    </>
  )
}

function ParcelProfile({
  parcel,
  navigate,
  aiCache,
  getOrFetchParcelAnalysis,
  isAnalyzing,
}: {
  parcel: Parcel
  navigate: (s: string) => void
  aiCache: ParcelAnalysisCache
  getOrFetchParcelAnalysis: (p: Parcel, force?: boolean) => Promise<ParcelAnalysis>
  isAnalyzing: boolean
}) {
  const [liveDetail, setLiveDetail] = useState<ApiParcelDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    fetchParcelDetail(parcel.id)
      .then(({ raw }) => {
        if (isMounted) {
          setLiveDetail(raw)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load live parcel profile.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [parcel.id])

  const sessionAnalysis = aiCache[parcel.id]
  const dbAiResult = liveDetail?.current_ai_result

  const runProfileAnalysis = async () => {
    try {
      await getOrFetchParcelAnalysis(parcel, true)
    } catch {
      // Handled inside helper
    }
  }

  const activeRiskScore = sessionAnalysis
    ? Math.round(sessionAnalysis.prediction.risk_score)
    : dbAiResult
    ? Math.round(dbAiResult.risk_score)
    : parcel.risk

  const activeRiskLevel = sessionAnalysis
    ? sessionAnalysis.prediction.risk_level
    : dbAiResult
    ? dbAiResult.risk_level
    : getRiskLabel(parcel.risk)

  const activeContributors = sessionAnalysis
    ? sessionAnalysis.explanation.contributors
    : dbAiResult
    ? dbAiResult.top_positive_contributors
    : []

  return (
    <>
      <Button className="back-button" onClick={() => navigate('/parcels')}>
        <ArrowLeft size={15} /> Back to parcels list
      </Button>

      {loading && (
        <div className="panel" style={{ padding: '10px 16px', marginBottom: '12px' }}>
          <small className="muted font-mono">Loading live parcel profile from PostgreSQL...</small>
        </div>
      )}

      {error && (
        <div className="panel" style={{ padding: '10px 16px', background: '#fdf3f2', border: '1px solid #f5c6cb', color: '#721c24', marginBottom: '12px' }}>
          <small>API Notice: {error} Displaying session parcel view.</small>
        </div>
      )}

      <Heading
        eyebrow="PARCEL INTELLIGENCE PROFILE"
        title={parcel.id}
        subtitle={`${parcel.district} district · ${parcel.survey} · ${parcel.area} · ${parcel.project}`}
        action={
          <Button className="primary-button" onClick={runProfileAnalysis} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analyzing ML Model...' : sessionAnalysis || dbAiResult ? 'Re-analyze Parcel' : 'Run Full Analysis'} <Sparkles size={14} />
          </Button>
        }
      />

      <div className="profile-grid">
        <div className="panel detail-panel">
          <div className="panel-head">
            <div>
              <h3>Land & Ownership Record</h3>
              <p>Cadastral and title attributes</p>
            </div>
            <span className={`risk-pill ${parcel.dispute ? 'high' : 'medium'}`}>{parcel.status}</span>
          </div>
          <div className="profile-fields">
            <Field label="Parcel ID" value={parcel.id} />
            <Field label="Survey Number" value={parcel.survey} />
            <Field label="Land Type" value={parcel.landType} />
            <Field label="Land Use" value={parcel.landUse} />
            <Field label="Primary Owner" value={parcel.owner} />
            <Field label="Ownership Complexity" value={parcel.dispute ? 'High (Multiple Claims)' : 'Standard Title'} />
            <Field label="Associated Project" value={parcel.project} />
            <Field label="Valuation Estimate" value={parcel.value} />
          </div>
        </div>

        <div className="panel intelligence-panel">
          <div className="panel-head">
            <div>
              <h3>AI Decision Support</h3>
              <p>{sessionAnalysis ? `ML Model Output (${sessionAnalysis.explanation.explanation_method})` : dbAiResult ? `Persisted AI Analysis (${dbAiResult.model_version})` : 'Seeded Initial Parameters'}</p>
            </div>
            <Sparkles size={18} className="ai-icon" />
          </div>

          <div className="ai-score-row">
            <div>
              <small>ML Risk Score</small>
              <strong className={activeRiskScore > 60 ? 'risk-high' : 'risk-low'}>{activeRiskScore}/100</strong>
              <span>{activeRiskLevel} RISK</span>
            </div>
            <div>
              <small>Suitability (Seeded)</small>
              <strong className="risk-low">{parcel.suitability}/100</strong>
              <span>EXCELLENT</span>
            </div>
            <div>
              <small>Delay Estimate</small>
              <strong>{parcel.delay}</strong>
              <span>ESTIMATED</span>
            </div>
          </div>

          <div className="progress">
            <i style={{ width: `${activeRiskScore}%`, background: activeRiskScore > 60 ? '#d8634d' : activeRiskScore > 30 ? '#e9a23b' : '#54a884' }}></i>
          </div>

          <div className="reason-list">
            <strong>{sessionAnalysis || dbAiResult ? 'Top ML SHAP Risk Contributors' : 'Initial Risk Indicators'}</strong>
            {activeContributors.length > 0 ? (
              activeContributors.slice(0, 4).map((c, i) => (
                <span key={i}>
                  {formatFeatureName(c.feature)} <b className={c.impact >= 0 ? '' : 'negative'}>{c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(2)}</b>
                </span>
              ))
            ) : (
              <>
                <span>Ownership complexity (Seeded) <b>+21.0</b></span>
                <span>Previous dispute (Seeded) <b>+19.0</b></span>
                <span>Compensation exposure (Seeded) <b>+15.0</b></span>
                <span>Environmental risk (Seeded) <b>+8.0</b></span>
              </>
            )}
          </div>

          {(sessionAnalysis || dbAiResult) && (
            <div style={{ padding: '0 19px 15px', fontSize: '9px', color: '#7a8e8c' }}>
              <em>AI supports review and does not autonomously approve or reject acquisition decisions.</em>
            </div>
          )}
        </div>
      </div>

      <div className="panel timeline-panel">
        <div className="panel-head">
          <div>
            <h3>Acquisition Stage Timeline</h3>
            <p>Stage transitions recorded in session audit log</p>
          </div>
        </div>
        <div className="timeline">
          {stages.map((stage, i) => (
            <div key={stage} className={i < 3 ? 'timeline-step done' : i === 3 ? 'timeline-step current' : 'timeline-step'}>
              <span>{i < 3 ? <Check size={13} /> : i + 1}</span>
              <div>
                <strong>{stage}</strong>
                <small>{i < 3 ? 'Completed' : i === 3 ? 'Current Action' : 'Pending'}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}


function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function AI({
  notify,
  navigate,
  aiCache,
  getOrFetchParcelAnalysis,
  analyzingMap,
}: {
  notify: (s: string) => void
  navigate: (s: string) => void
  aiCache: ParcelAnalysisCache
  getOrFetchParcelAnalysis: (p: Parcel, force?: boolean) => Promise<ParcelAnalysis>
  analyzingMap: Record<string, boolean>
}) {
  const [running, setRunning] = useState(false)
  const [selectedParcelId, setSelectedParcelId] = useState<string>('BR-042-0187')
  const [historyRecords, setHistoryRecords] = useState<ApiAiAnalysisRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState<boolean>(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const runBatchAnalysis = async () => {
    setRunning(true)
    try {
      await Promise.all(parcels.map((p) => getOrFetchParcelAnalysis(p, true)))
      notify('All candidate parcels evaluated & persisted to PostgreSQL.')
    } catch {
      notify('Some parcels failed during batch ML evaluation.')
    } finally {
      setRunning(false)
    }
  }

  // Fetch AI evaluation history specifically for selected parcel
  useEffect(() => {
    let isMounted = true
    setHistoryLoading(true)
    setHistoryError(null)

    fetchParcelAiHistory(selectedParcelId)
      .then((records) => {
        if (isMounted) {
          setHistoryRecords(records)
          setHistoryLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setHistoryError(err instanceof Error ? err.message : 'No PostgreSQL history found for selected parcel.')
          setHistoryRecords([])
          setHistoryLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [selectedParcelId, aiCache])

  // Derive rankings from shared aiCache + parcels
  const evaluatedList = parcels.map((p) => {
    const cached = aiCache[p.id]
    return {
      parcel: p,
      riskScore: cached ? cached.prediction.risk_score : p.risk,
      riskLevel: cached ? cached.prediction.risk_level : getRiskLabel(p.risk),
      isAnalyzed: !!cached,
      isPersisted: cached ? (cached.prediction.is_persisted ?? true) : false,
      contributors: cached ? cached.explanation.contributors : [],
      analysisId: cached?.prediction.analysis_id,
      modelVersion: cached?.prediction.model_version || 'acquisition-risk-0.1.0',
    }
  })

  const sortedByRisk = [...evaluatedList].sort((a, b) => b.riskScore - a.riskScore)
  const selectedEvaluated = evaluatedList.find((item) => item.parcel.id === selectedParcelId) || sortedByRisk[0]

  const highestRiskScore = Math.round(sortedByRisk[0].riskScore)
  const highestRiskLevel = sortedByRisk[0].riskLevel
  const medianDelay = '5.8 mo'

  return (
    <>
      <Heading
        eyebrow="DECISION SUPPORT · AI ENGINE HUB"
        title="AI Land Intelligence Engine"
        subtitle="Evaluates candidate parcels using FastAPI sklearn model & SHAP feature attributions."
        action={
          <Button className="primary-button" onClick={runBatchAnalysis} disabled={running || Object.values(analyzingMap).some(Boolean)}>
            {running ? 'Batch Analyzing...' : 'Analyze All Candidate Parcels'} <Sparkles size={14} />
          </Button>
        }
      />

      <div className="ai-banner">
        <Sparkles size={20} />
        <div>
          <strong>Decision support, not an automated decision</strong>
          <span>Use ML explanations to prioritize officer review. Authorized district officers make final acquisition decisions.</span>
        </div>
        <span className={`demo-tag ${selectedEvaluated.isPersisted ? 'live' : ''}`} style={{ background: selectedEvaluated.isPersisted ? '#cce5d8' : '#e2e9e6', color: selectedEvaluated.isPersisted ? '#1f4d38' : '#557074' }}>
          {selectedEvaluated.isPersisted ? 'POSTGRES PERSISTED' : 'DEMO / NON-PERSISTED'}
        </span>
      </div>

      <div className="ai-workspace">
        <div className="panel ai-overview">
          <div className="panel-head">
            <div>
              <h3>NH-327 Ring Road Candidate Ranking</h3>
              <p>{evaluatedList.filter((e) => e.isAnalyzed).length} of {parcels.length} parcels evaluated & persisted</p>
            </div>
          </div>

          <div className="ai-score-cards">
            <div>
              <small>Highest ML Risk Score</small>
              <strong className="risk-high">{highestRiskScore} / 100</strong>
              <span>{highestRiskLevel} RISK</span>
            </div>
            <div>
              <small>Best Suitability (Seeded)</small>
              <strong className="risk-low">94 / 100</strong>
              <span>EXCELLENT</span>
            </div>
            <div>
              <small>Median Delay (Seeded)</small>
              <strong>{medianDelay}</strong>
              <span>ESTIMATED</span>
            </div>
          </div>

          <div className="rank-list">
            {sortedByRisk.map((item, i) => (
              <div
                key={item.parcel.id}
                style={{
                  cursor: 'pointer',
                  borderLeft: selectedParcelId === item.parcel.id ? '3px solid #315761' : '3px solid transparent',
                  background: selectedParcelId === item.parcel.id ? '#f2f7f5' : undefined,
                }}
                onClick={() => setSelectedParcelId(item.parcel.id)}
              >
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{item.parcel.id}</strong>
                  <small>
                    {item.parcel.area} · {item.parcel.landUse} · {item.isAnalyzed ? (item.isPersisted ? 'PostgreSQL Saved' : 'ML Verified') : 'Seeded Baseline'}
                  </small>
                </span>
                <i className="suitability-bar">
                  <em style={{ width: `${item.parcel.suitability}%` }}></em>
                </i>
                <strong className="rank-score">{Math.round(item.riskScore)}</strong>
                <Button onClick={() => navigate(`/parcels/${item.parcel.id}`)}>
                  <ArrowRight size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel contributors">
          <div className="panel-head">
            <div>
              <h3>SHAP Risk Explanation</h3>
              <p>{selectedEvaluated.parcel.id} · Feature Attributions ({selectedEvaluated.modelVersion})</p>
            </div>
            <span className={`risk-pill ${selectedEvaluated.riskScore > 60 ? 'high' : 'medium'}`}>
              {selectedEvaluated.riskLevel}
            </span>
          </div>

          {selectedEvaluated.contributors.length > 0 ? (
            <div className="reason-list">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '11px' }}>SHAP Relative Impact ({selectedEvaluated.parcel.id})</strong>
                <Button
                  className="quiet-button"
                  style={{ padding: '2px 6px', fontSize: '10px' }}
                  onClick={() => getOrFetchParcelAnalysis(selectedEvaluated.parcel, true)}
                  disabled={!!analyzingMap[selectedEvaluated.parcel.id]}
                >
                  <RefreshCw size={11} /> {analyzingMap[selectedEvaluated.parcel.id] ? 'Re-analyzing...' : 'Re-run Model'}
                </Button>
              </div>

              {selectedEvaluated.contributors.map((c, i) => (
                <div key={i} className="small-reason" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '6px 0', borderBottom: '1px solid #f0f4f2' }}>
                  <span>{formatFeatureName(c.feature)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '60px', height: '6px', background: '#e5ebe8', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.abs(c.impact) * 4)}%`,
                          height: '100%',
                          background: c.impact >= 0 ? '#d8634d' : '#54a884',
                        }}
                      />
                    </div>
                    <b className={c.impact >= 0 ? '' : 'negative'} style={{ color: c.impact >= 0 ? '#c45c49' : '#4d9a78', minWidth: '45px', textAlign: 'right' }}>
                      {c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(2)}
                    </b>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={24} />
              <strong>No ML SHAP analysis cached for {selectedEvaluated.parcel.id}</strong>
              <Button className="primary-button" style={{ marginTop: '8px' }} onClick={() => getOrFetchParcelAnalysis(selectedEvaluated.parcel, true)}>
                Run ML Analysis for {selectedEvaluated.parcel.id}
              </Button>
            </div>
          )}

          {/* Historical Analysis Timeline */}
          <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e2ece7' }}>
            <h4 style={{ fontSize: '12px', font: '700 12px Georgia, serif', color: '#294b55', marginBottom: '8px' }}>
              PostgreSQL Evaluation History ({selectedEvaluated.parcel.id})
            </h4>

            {historyLoading && <small className="muted font-mono">Fetching evaluation timeline from PostgreSQL...</small>}
            {historyError && <small style={{ color: '#721c24' }}>Notice: {historyError}</small>}

            {historyRecords.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {historyRecords.map((rec) => (
                  <div key={rec.id} style={{ background: rec.is_current ? '#f5faf7' : '#fafcfc', border: rec.is_current ? '1px solid #cce5d8' : '1px solid #e8f0eb', padding: '8px 10px', borderRadius: '4px', fontSize: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong>Score: {Math.round(rec.risk_score)} / 100 ({rec.risk_level})</strong>
                      <span style={{ background: rec.is_current ? '#1f4d38' : '#889896', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '8px' }}>
                        {rec.is_current ? 'CURRENT' : 'HISTORICAL'}
                      </span>
                    </div>
                    <div style={{ color: '#687876', fontSize: '9px' }}>
                      Version: <code>{rec.model_version}</code> · {new Date(rec.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !historyLoading && <small className="muted">No historical runs recorded in database yet.</small>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Projects({ notify, navigate }: { notify: (s: string) => void; navigate: (s: string) => void }) {
  const [liveProjects, setLiveProjects] = useState<(typeof projects)[0][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    fetchProjects()
      .then(({ ui }) => {
        if (isMounted) {
          setLiveProjects(ui)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load projects from live API.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const displayProjects = liveProjects.length > 0 || loading || error ? liveProjects : projects

  return (
    <>
      <Heading title="Acquisition Projects" subtitle="Active land acquisition programs across district zones." action={<Button className="primary-button" onClick={() => notify('Project creation form: Contact system administrator')}>+ New Project</Button>} />
      
      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: '#557074' }}>
          <span>Loading projects from live database...</span>
        </div>
      )}

      {error && (
        <div className="panel" style={{ padding: '14px 20px', background: '#fdf3f2', border: '1px solid #f5c6cb', color: '#721c24', marginBottom: '14px' }}>
          <strong>API Connection Notice:</strong> {error} Showing offline project cache.
        </div>
      )}

      {!loading && (
        <div className="project-grid">
          {displayProjects.map((p) => (
            <Button key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
              <div>
                <span className="project-code">{p.id}</span>
                <span className="status-label">{p.status}</span>
              </div>
              <h3>{p.name}</h3>
              <p>
                {p.type} · {p.district} district
              </p>
              <div className="project-progress">
                <span>
                  <strong>{p.progress}%</strong> complete
                </span>
                <span>{p.parcels} parcels</span>
                <i>
                  <em style={{ width: `${p.progress}%` }}></em>
                </i>
              </div>
              <small>
                Target date · {p.target} <ArrowRight size={14} />
              </small>
            </Button>
          ))}
        </div>
      )}

      {!loading && displayProjects.length === 0 && (
        <div className="empty-state">
          <Landmark size={24} />
          <strong>No active projects found</strong>
        </div>
      )}
    </>
  )
}

function ProjectDetail({
  project,
  notify,
  navigate,
  openParcel,
  aiCache,
  disputes,
  documents,
  auditEvents,
  selectedProjectTab,
  setSelectedProjectTab,
}: {
  project: (typeof projects)[0]
  notify: (s: string) => void
  navigate: (s: string) => void
  openParcel: (p: Parcel) => void
  aiCache: ParcelAnalysisCache
  disputes: DisputeRecord[]
  documents: DocumentRecord[]
  auditEvents: AuditEvent[]
  selectedProjectTab: Record<string, string>
  setSelectedProjectTab: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const [liveDetail, setLiveDetail] = useState<{ raw: ApiProjectDetailResponse; ui: (typeof projects)[0] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    fetchProjectByCode(project.id)
      .then((data) => {
        if (isMounted) {
          setLiveDetail(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load project detail from live API.')
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [project.id])

  const activeProject = liveDetail?.ui || project
  const activeTab = selectedProjectTab[activeProject.id] || 'Overview'

  const setTab = (tab: string) => {
    setSelectedProjectTab((prev) => ({ ...prev, [activeProject.id]: tab }))
  }

  const projectParcels = parcels.filter((p: Parcel) => p.project.includes(activeProject.id) || activeProject.id === 'NH-327')
  const projectDisputes = disputes.filter((d: DisputeRecord) => d.projectId === activeProject.id)
  const projectDocuments = (documents || []).filter((doc: DocumentRecord) => doc.projectId === activeProject.id)
  const projectAudit = (auditEvents || []).filter((a: AuditEvent) => a.projectId === activeProject.id || a.parcelId?.includes(activeProject.id))
  const analyzedParcelsInProject = projectParcels.filter((p: Parcel) => Boolean(aiCache[p.id]))

  return (
    <>
      <Button className="back-button" onClick={() => navigate('/projects')}>
        <ArrowLeft size={15} /> Back to projects
      </Button>

      {loading && (
        <div className="panel" style={{ padding: '10px 16px', marginBottom: '12px' }}>
          <small className="muted font-mono">Loading live project detail from PostgreSQL...</small>
        </div>
      )}

      {error && (
        <div className="panel" style={{ padding: '10px 16px', background: '#fdf3f2', border: '1px solid #f5c6cb', color: '#721c24', marginBottom: '12px' }}>
          <small>API Notice: {error} Displaying session project view.</small>
        </div>
      )}

      <Heading eyebrow={`PROJECT WORKSPACE · ${activeProject.id}`} title={activeProject.name} subtitle={`${activeProject.type} · ${activeProject.district} district · Target: ${activeProject.target}`} action={<Button className="primary-button" onClick={() => notify(`Project settings saved for ${activeProject.id}`)}>Update Project</Button>} />

      <div className="project-tabs">
        {['Overview', 'Parcels', 'Workflow', 'Documents', 'AI', 'Audit'].map((tab) => (
          <Button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setTab(tab)}>
            {tab}
          </Button>
        ))}
      </div>


      {activeTab === 'Overview' && (
        <div className="project-detail-grid">
          <div className="panel project-overview">
            <div className="panel-head">
              <div>
                <h3>Acquisition Progress Overview</h3>
                <p>Current stage distribution across project scope</p>
              </div>
              <strong className="big-progress">{project.progress}%</strong>
            </div>
            <div className="large-progress">
              <i style={{ width: `${project.progress}%` }}></i>
            </div>
            <div className="stage-grid">
              {stages.map((stage, i) => (
                <div key={stage} className={i < 4 ? 'done' : i === 4 ? 'current' : ''}>
                  <span>{i < 4 ? <Check size={13} /> : i + 1}</span>
                  <strong>{stage}</strong>
                  <small>{i < 4 ? 'Complete' : i === 4 ? 'In Progress' : 'Pending'}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Pending Action Items</h3>
                <p>Tasks assigned to project team</p>
              </div>
            </div>
            <div className="action-list">
              <Button onClick={() => navigate('/disputes')}>
                <AlertTriangle size={15} />
                <span>
                  <strong>Review {projectDisputes.length} active disputes</strong>
                  <small>Requires district officer action</small>
                </span>
                <ArrowRight size={14} />
              </Button>
              <Button onClick={() => navigate('/compensation')}>
                <Activity size={15} />
                <span>
                  <strong>Approve compensation queues</strong>
                  <small>Pending financial desk approval</small>
                </span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Parcels' && (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Parcel ID</th>
                <th>Survey</th>
                <th>Area</th>
                <th>Status</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projectParcels.map((p) => (
                <tr key={p.id} onClick={() => openParcel(p)}>
                  <td>
                    <strong>{p.id}</strong>
                  </td>
                  <td>{p.survey}</td>
                  <td>{p.area}</td>
                  <td>
                    <span className="risk-pill medium">{p.status}</span>
                  </td>
                  <td>{p.owner}</td>
                  <td>
                    <ArrowRight size={15} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'Workflow' && (
        <div className="panel" style={{ padding: '20px' }}>
          <h3 style={{ font: '700 15px Georgia, serif', color: '#294b55' }}>Acquisition Stage Workflow</h3>
          <p style={{ fontSize: '11px', color: '#859397', marginBottom: '15px' }}>Interactive stage progression tracking</p>
          <div className="timeline">
            {stages.map((stage, i) => (
              <div key={stage} className={i < 4 ? 'timeline-step done' : i === 4 ? 'timeline-step current' : 'timeline-step'}>
                <span>{i < 4 ? <Check size={13} /> : i + 1}</span>
                <div>
                  <strong>{stage}</strong>
                  <small>{i < 4 ? 'Completed' : i === 4 ? 'Active Stage' : 'Queued'}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Documents' && (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Document Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Date Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {projectDocuments.map((doc: DocumentRecord) => (
                <tr key={doc.id}>
                  <td>
                    <strong>{doc.title}</strong>
                  </td>
                  <td>{doc.category}</td>
                  <td>
                    <span className={`risk-pill ${doc.status === 'Verified' ? 'low' : 'high'}`}>{doc.status}</span>
                  </td>
                  <td>{doc.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {projectDocuments.length === 0 && (
            <div className="empty-state">
              <FileText size={20} />
              <strong>No documents attached to {project.id}</strong>
            </div>
          )}
        </div>
      )}

      {activeTab === 'AI' && (
        <div className="panel" style={{ padding: '20px' }}>
          <h3 style={{ font: '700 15px Georgia, serif', color: '#294b55' }}>Project AI Intelligence Summary</h3>
          <p style={{ fontSize: '11px', color: '#859397', marginBottom: '15px' }}>Derived exclusively from analyzed parcels in this project scope</p>
          {analyzedParcelsInProject.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ background: '#f5f8f6', padding: '12px', borderRadius: '5px' }}>
                <small style={{ fontSize: '9px', color: '#889896' }}>Analyzed Parcels</small>
                <strong style={{ display: 'block', fontSize: '18px', color: '#315761' }}>{analyzedParcelsInProject.length}</strong>
              </div>
              <div style={{ background: '#f5f8f6', padding: '12px', borderRadius: '5px' }}>
                <small style={{ fontSize: '9px', color: '#889896' }}>Max ML Risk</small>
                <strong style={{ display: 'block', fontSize: '18px', color: '#d8634d' }}>
                  {Math.round(Math.max(...analyzedParcelsInProject.map((p: Parcel) => aiCache[p.id].prediction.risk_score)))} / 100
                </strong>
              </div>
              <div style={{ background: '#f5f8f6', padding: '12px', borderRadius: '5px' }}>
                <small style={{ fontSize: '9px', color: '#889896' }}>Average ML Risk</small>
                <strong style={{ display: 'block', fontSize: '18px', color: '#e9a23b' }}>
                  {Math.round(analyzedParcelsInProject.reduce((acc: number, p: Parcel) => acc + aiCache[p.id].prediction.risk_score, 0) / analyzedParcelsInProject.length)} / 100
                </strong>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={24} />
              <strong>No parcel AI analyses completed yet for {project.id}</strong>
              <span>Go to GIS or AI Engine page and click "Run Full Analysis" to evaluate candidate parcels.</span>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Audit' && (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Event Title</th>
                <th>Actor</th>
                <th>Timestamp</th>
                <th>Payload Hash</th>
              </tr>
            </thead>
            <tbody>
              {projectAudit.map((a: AuditEvent) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                  </td>
                  <td>{a.actor}</td>
                  <td>{a.timestamp}</td>
                  <td>
                    <code>{a.payloadHash}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {projectAudit.length === 0 && (
            <div className="empty-state">
              <ShieldCheck size={20} />
              <strong>No audit records found for {project.id}</strong>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function DisputesView({
  notify,
  navigate,
}: {
  notify: (s: string) => void
  navigate: (s: string) => void
}) {
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [disputes, setDisputes] = useState<DisputeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDisputes = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDisputes({
        search: query.trim() || undefined,
        status: filterStatus !== 'All' ? filterStatus : undefined,
      })
      setDisputes(res.items.map(mapApiDisputeToUi))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch disputes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDisputes()
  }, [query, filterStatus])

  return (
    <>
      <div className="demo-badge live" style={{ marginBottom: '12px' }}>
        <span className="live-dot"></span> POSTGRES LIVE API
      </div>
      <Heading
        title="Disputes & Objections"
        subtitle="Review, assign, and resolve land acquisition objections across active projects."
        action={
          <Button className="primary-button" onClick={() => notify('New dispute form: Contact district legal cell')}>
            + File New Objection
          </Button>
        }
      />

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dispute ID, parcel ID, category, or officer..."
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option>All</option>
          <option>Under review</option>
          <option>Escalated</option>
          <option>In mediation</option>
          <option>Resolved</option>
        </select>
        <Button className="outline-button" onClick={loadDisputes} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </Button>
      </div>

      <div className="record-layout">
        <div className="panel record-list">
          {loading ? (
            <div className="empty-state">
              <RefreshCw size={20} className="spinning" />
              <strong>Loading disputes from PostgreSQL...</strong>
            </div>
          ) : error ? (
            <div className="empty-state error">
              <AlertTriangle size={20} />
              <strong>Failed to load disputes</strong>
              <span>{error}</span>
              <Button className="outline-button" onClick={loadDisputes}>
                Retry
              </Button>
            </div>
          ) : disputes.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle size={20} />
              <strong>No disputes found matching filter</strong>
            </div>
          ) : (
            disputes.map((d) => (
              <Button key={d.id} onClick={() => navigate(`/disputes/${d.id}`)}>
                <span className={`record-icon ${d.status === 'Resolved' ? 'blue' : 'red'}`}>
                  <AlertTriangle size={15} />
                </span>
                <span>
                  <strong>
                    {d.id} · {d.category}
                  </strong>
                  <small>
                    Parcel {d.parcelId} · Assigned to {d.assignedTo} · {d.status}
                  </small>
                </span>
                <ArrowRight size={15} />
              </Button>
            ))
          )}
        </div>

        <div className="panel empty-state">
          <ShieldCheck size={25} />
          <strong>Select a dispute record to inspect details</strong>
          <span>Review legal claims, reassign officers, or mark objections resolved in PostgreSQL live state.</span>
        </div>
      </div>
    </>
  )
}

function DisputeDetail({
  disputeId,
  notify,
  navigate,
}: {
  disputeId: string
  notify: (s: string) => void
  navigate: (s: string) => void
}) {
  const [dispute, setDispute] = useState<DisputeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const loadDispute = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDisputes({ search: disputeId })
      const found = res.items.find(
        (item) => item.dispute_code === disputeId || item.id === disputeId
      ) || res.items[0]

      if (found) {
        setDispute(mapApiDisputeToUi(found))
      } else {
        setError(`Dispute '${disputeId}' not found`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dispute detail')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDispute()
  }, [disputeId])

  const handleUpdate = async (payload: { status?: string; priority?: string }) => {
    if (!dispute) return
    setUpdating(true)
    try {
      const updated = await updateDispute(dispute.dbId || dispute.id, payload)
      const mapped = mapApiDisputeToUi(updated)
      setDispute(mapped)
      notify(`Dispute ${mapped.id} updated (Status: ${mapped.status}, Priority: ${mapped.priority}) · SHA-256 Audit Recorded`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update dispute'
      notify(`Error updating dispute: ${msg}`)
    } finally {
      setUpdating(false)
    }
  }

  const toggleResolve = () => {
    if (!dispute) return
    const nextStatus = dispute.status === 'Resolved' ? 'Under review' : 'Resolved'
    handleUpdate({ status: nextStatus })
  }

  const changePriority = (p: 'HIGH' | 'MEDIUM' | 'LOW') => {
    handleUpdate({ priority: p })
  }

  if (loading) {
    return (
      <div className="panel empty-state">
        <RefreshCw size={25} className="spinning" />
        <strong>Loading dispute detail from PostgreSQL...</strong>
      </div>
    )
  }

  if (error || !dispute) {
    return (
      <>
        <Button className="back-button" onClick={() => navigate('/disputes')}>
          <ArrowLeft size={15} /> Back to disputes list
        </Button>
        <div className="panel empty-state error">
          <AlertTriangle size={25} />
          <strong>Error loading dispute</strong>
          <span>{error}</span>
        </div>
      </>
    )
  }

  return (
    <>
      <Button className="back-button" onClick={() => navigate('/disputes')}>
        <ArrowLeft size={15} /> Back to disputes list
      </Button>
      <div className="demo-badge live" style={{ marginBottom: '12px' }}>
        <span className="live-dot"></span> POSTGRES LIVE API
      </div>
      <Heading
        eyebrow={`DISPUTE DETAIL · POSTGRES DB ID: ${dispute.dbId || 'N/A'}`}
        title={`Objection ${dispute.id}`}
        subtitle={`${dispute.category} · Parcel ${dispute.parcelId} · Project ${dispute.projectId}`}
        action={
          <Button className="primary-button" onClick={toggleResolve} disabled={updating}>
            {updating ? 'Updating...' : dispute.status === 'Resolved' ? 'Re-open Dispute' : 'Mark Resolved'}{' '}
            <Check size={14} />
          </Button>
        }
      />

      <div className="record-layout">
        <div className="panel detail-panel">
          <div className="panel-head">
            <div>
              <h3>Objection Summary</h3>
              <p>Filed on {dispute.date}</p>
            </div>
            <span className={`risk-pill ${dispute.status === 'Resolved' ? 'low' : 'high'}`}>{dispute.status}</span>
          </div>

          <div className="profile-fields">
            <Field label="Dispute ID" value={dispute.id} />
            <Field label="Parcel ID" value={dispute.parcelId} />
            <Field label="Category" value={dispute.category} />
            <Field label="Assigned Officer" value={dispute.assignedTo} />
            <Field label="Priority Level" value={dispute.priority} />
            <Field label="Status" value={dispute.status} />
            {dispute.resolvedAt && (
              <Field label="Resolved At" value={new Date(dispute.resolvedAt).toLocaleString()} />
            )}
          </div>

          <div style={{ padding: '0 19px 19px' }}>
            <small style={{ color: '#8a9998', fontSize: '9px', display: 'block', marginBottom: '4px' }}>
              Claim Description
            </small>
            <p style={{ margin: 0, fontSize: '11px', color: '#3d5b60', lineHeight: 1.4 }}>{dispute.description}</p>
          </div>

          <div style={{ padding: '0 19px 19px', display: 'flex', gap: '10px' }}>
            <Button className="outline-button" onClick={() => changePriority('HIGH')} disabled={updating}>
              Set Priority High
            </Button>
            <Button className="outline-button" onClick={() => changePriority('MEDIUM')} disabled={updating}>
              Set Priority Medium
            </Button>
          </div>
        </div>

        <div className="panel empty-state">
          <ShieldCheck size={25} />
          <strong>Audit History & Legal Logs</strong>
          <span>
            Filed on {dispute.date} · Priority: {dispute.priority} · Current Status: {dispute.status}
          </span>
          <span style={{ fontSize: '11px', color: '#4d8076', marginTop: '8px' }}>
            ✓ Status and priority changes are cryptographically hashed and logged to PostgreSQL audit_events on commit.
          </span>
        </div>
      </div>
    </>
  )
}

function CompensationView({ notify }: { notify: (s: string) => void }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [compensations, setCompensations] = useState<CompensationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const loadCompensations = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchCompensations({
        search: query.trim() || undefined,
        status: statusFilter !== 'All' ? statusFilter : undefined,
      })
      setCompensations(res.items.map(mapApiCompensationToUi))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch compensation records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCompensations()
  }, [query, statusFilter])

  const cycleStatus = async (record: CompensationRecord) => {
    const nextStatus = getNextCompensationStatus(record.status)
    const dbId = record.dbId || record.id
    setUpdatingId(record.id)

    try {
      const res = await updateCompensation(dbId, { status: nextStatus })
      const updatedUi = mapApiCompensationToUi(res)
      setCompensations((prev) =>
        prev.map((c) => (c.id === record.id || c.dbId === dbId ? updatedUi : c))
      )
      notify(`Compensation ${updatedUi.id} updated to ${updatedUi.status} · SHA-256 Audit Recorded`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status'
      notify(`Error updating compensation ${record.id}: ${msg}`)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <>
      <div className="demo-badge live" style={{ marginBottom: '12px' }}>
        <span className="live-dot"></span> POSTGRES LIVE API
      </div>
      <Heading
        title="Compensation Tracking Queue"
        subtitle="Monitor valuation approvals and disbursement status across parcels in real time."
        action={
          <Button className="primary-button" onClick={() => notify('Batch payout export generated')}>
            Export Payout Schedule
          </Button>
        }
      />

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search compensation ID, parcel ID, or payee name..."
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All</option>
          <option>Pending approval</option>
          <option>Processing</option>
          <option>Ready</option>
          <option>Released</option>
        </select>
        <Button className="outline-button" onClick={loadCompensations} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </Button>
      </div>

      <div className="panel table-panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw size={20} className="spinning" />
            <strong>Loading compensation records from PostgreSQL...</strong>
          </div>
        ) : error ? (
          <div className="empty-state error">
            <AlertTriangle size={20} />
            <strong>Failed to load compensations</strong>
            <span>{error}</span>
            <Button className="outline-button" onClick={loadCompensations}>
              Retry
            </Button>
          </div>
        ) : compensations.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={20} />
            <strong>No compensation records found</strong>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Parcel ID</th>
                <th>Payee Name</th>
                <th>Amount</th>
                <th>Disbursement Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {compensations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.id}</strong>
                  </td>
                  <td>{c.parcelId}</td>
                  <td>{c.payee}</td>
                  <td>
                    <strong>{c.amount}</strong>
                  </td>
                  <td>
                    <span className={`risk-pill ${c.status === 'Released' ? 'low' : c.status === 'Ready' ? 'info' : 'medium'}`}>
                      {c.status}
                    </span>
                    {c.disbursedAt && (
                      <small style={{ display: 'block', fontSize: '10px', color: '#54a884', marginTop: '2px' }}>
                        Disbursed: {new Date(c.disbursedAt).toLocaleDateString()}
                      </small>
                    )}
                  </td>
                  <td>
                    <Button
                      className="outline-button"
                      onClick={() => cycleStatus(c)}
                      disabled={updatingId === c.id}
                    >
                      {updatingId === c.id ? 'Updating...' : 'Advance Status'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function DocumentsView({ notify }: { notify: (s: string) => void }) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [showModal, setShowModal] = useState(false)

  // Registration Modal state
  const [regTitle, setRegTitle] = useState('')
  const [regCategory, setRegCategory] = useState('Survey Map')
  const [regParcelId, setRegParcelId] = useState('BR-042-0187')
  const [regSizeMb, setRegSizeMb] = useState('2.4')

  const loadDocuments = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDocuments({
        search: query.trim() || undefined,
        category: categoryFilter !== 'All' ? categoryFilter : undefined,
      })
      setDocuments(res.items.map(mapApiDocumentToUi))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [query, categoryFilter])

  const handleRegisterDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regTitle.trim()) {
      notify('Please enter a document title')
      return
    }

    setRegistering(true)
    try {
      const projectDetail = await fetchProjectByCode('NH-327')

      let parcelUuid: string | undefined = undefined
      try {
        const parcelDetail = await fetchParcelDetail(regParcelId)
        parcelUuid = parcelDetail.raw.id
      } catch {
        // Fallback if parcel detail resolution fails
      }

      const docCode = `DOC-${Date.now().toString().slice(-4)}`
      const payload = {
        document_code: docCode,
        title: regTitle.trim(),
        project_id: projectDetail.raw.id,
        parcel_id: parcelUuid,
        category: regCategory,
        storage_path: `/storage/docs/${docCode.toLowerCase()}.pdf`,
        file_size_bytes: Math.max(1024, Math.round((parseFloat(regSizeMb) || 1.0) * 1048576)),
        mime_type: 'application/pdf',
        verification_status: 'Verified',
      }

      const created = await createDocumentMetadata(payload)
      const mapped = mapApiDocumentToUi(created)

      setDocuments((prev) => [mapped, ...prev])
      notify(`Registered document metadata '${mapped.id}' in PostgreSQL · SHA-256 Audit Logged`)
      setShowModal(false)
      setRegTitle('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      notify(`Document registration failed: ${msg}`)
    } finally {
      setRegistering(false)
    }
  }

  return (
    <>
      <div className="demo-badge live" style={{ marginBottom: '12px' }}>
        <span className="live-dot"></span> POSTGRES LIVE API
      </div>
      <Heading
        title="Document Repository"
        subtitle="Verified titles, survey maps, and valuation metadata records stored in PostgreSQL."
        action={
          <Button className="primary-button" onClick={() => setShowModal(true)}>
            <Upload size={14} /> Register Document Metadata
          </Button>
        }
      />

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', padding: '24px' }}>
            <h3>Register Document Metadata</h3>
            <p style={{ fontSize: '11px', color: '#8a9998', marginBottom: '16px' }}>
              Persist document metadata into PostgreSQL <code>document_records</code> table.
              Generates cryptographic SHA-256 audit event on commit (physical binary storage out of scope).
            </p>
            <form onSubmit={handleRegisterDocument} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Document Title</label>
                <input
                  type="text"
                  value={regTitle}
                  onChange={(e) => setRegTitle(e.target.value)}
                  placeholder="e.g. Survey Map · Parcel BR-042-0187"
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c4d0ce' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Category</label>
                  <select
                    value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c4d0ce' }}
                  >
                    <option>Land Title</option>
                    <option>Acquisition Notice</option>
                    <option>Valuation Report</option>
                    <option>Objection Filing</option>
                    <option>Survey Map</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Associated Parcel</label>
                  <select
                    value={regParcelId}
                    onChange={(e) => setRegParcelId(e.target.value)}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c4d0ce' }}
                  >
                    <option>BR-042-0187</option>
                    <option>BR-042-0188</option>
                    <option>BR-042-0191</option>
                    <option>BR-042-0193</option>
                    <option>BR-042-0195</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Estimated File Size (MB)</label>
                <input
                  type="number"
                  step="0.1"
                  value={regSizeMb}
                  onChange={(e) => setRegSizeMb(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c4d0ce' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <Button type="button" className="outline-button" onClick={() => setShowModal(false)} disabled={registering}>
                  Cancel
                </Button>
                <Button type="submit" className="primary-button" disabled={registering}>
                  {registering ? 'Registering...' : 'Confirm Registration'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search document title or parcel ID..."
          />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option>All</option>
          <option>Land Title</option>
          <option>Acquisition Notice</option>
          <option>Valuation Report</option>
          <option>Objection Filing</option>
          <option>Survey Map</option>
        </select>
        <Button className="outline-button" onClick={loadDocuments} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </Button>
      </div>

      <div className="panel table-panel">
        {loading ? (
          <div className="empty-state">
            <RefreshCw size={20} className="spinning" />
            <strong>Loading document metadata from PostgreSQL...</strong>
          </div>
        ) : error ? (
          <div className="empty-state error">
            <AlertTriangle size={20} />
            <strong>Failed to load documents</strong>
            <span>{error}</span>
            <Button className="outline-button" onClick={loadDocuments}>
              Retry
            </Button>
          </div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={20} />
            <strong>No documents found matching filter</strong>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document Title</th>
                <th>Parcel ID</th>
                <th>Category</th>
                <th>File Size</th>
                <th>Verification Status</th>
                <th>Date Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <strong>{doc.title}</strong>
                    {doc.storagePath && (
                      <small style={{ display: 'block', fontSize: '10px', color: '#8a9998', marginTop: '2px' }}>
                        Path: <code>{doc.storagePath}</code>
                      </small>
                    )}
                  </td>
                  <td>{doc.parcelId}</td>
                  <td>{doc.category}</td>
                  <td>{doc.fileSize}</td>
                  <td>
                    <span className={`risk-pill ${doc.status === 'Verified' ? 'low' : 'high'}`}>{doc.status}</span>
                  </td>
                  <td>{doc.uploadedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function AuditView() {
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('All')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [chainHealth, setChainHealth] = useState<{ event_count: number; latest_hash: string; chain_valid: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  const loadAudit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAuditEvents({
        search: query.trim() || undefined,
        action_type: actionFilter !== 'All' ? actionFilter : undefined,
      })
      setAuditEvents(res.items.map(mapApiAuditEventToUi))
      setChainHealth(res.chain_health)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit trail')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [query, actionFilter])

  const togglePayload = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <>
      <div className="demo-badge live" style={{ marginBottom: '12px' }}>
        <span className="live-dot"></span> POSTGRES LIVE API
      </div>
      <Heading
        title="Tamper-Evident Audit Trail"
        subtitle="Cryptographic SHA-256 hash chain log of land acquisition workflow events."
      />

      <div className="audit-health" style={{ borderColor: chainHealth?.chain_valid ? '#54a884' : '#df765b' }}>
        <ShieldCheck size={20} style={{ color: chainHealth?.chain_valid ? '#54a884' : '#df765b' }} />
        <div>
          <strong>
            {chainHealth ? (chainHealth.chain_valid ? 'Cryptographic Hash Chain Valid' : 'Hash Chain Tampered / Broken') : 'Checking Hash Chain...'}
          </strong>
          <span>
            {chainHealth
              ? `All ${chainHealth.event_count} workflow events cryptographically verified · Latest Hash: ${chainHealth.latest_hash.substring(0, 16)}...`
              : 'Verifying SHA-256 signatures in PostgreSQL...'}
          </span>
        </div>
        <span className="status-label" style={{ background: chainHealth?.chain_valid ? '#54a884' : '#df765b' }}>
          {chainHealth?.chain_valid ? 'VERIFIED' : 'INVALID'}
        </span>
      </div>

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search event code, title, or actor name..."
          />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option>All</option>
          <option value="AI_EVALUATION">AI Evaluation</option>
          <option value="DISPUTE_UPDATE">Dispute Update</option>
          <option value="COMPENSATION_UPDATE">Compensation Update</option>
          <option value="DOCUMENT_CREATE">Document Create</option>
          <option value="PARCEL_STATUS_UPDATE">Parcel Status Update</option>
          <option value="NOTICE_ISSUANCE">Notice Issuance</option>
          <option value="VALUATION_APPROVAL">Valuation Approval</option>
        </select>
        <Button className="outline-button" onClick={loadAudit} title="Refresh Audit Trail">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </Button>
      </div>

      <div className="panel audit-list">
        {loading ? (
          <div className="empty-state">
            <RefreshCw size={20} className="spinning" />
            <strong>Loading audit events from PostgreSQL...</strong>
          </div>
        ) : error ? (
          <div className="empty-state error">
            <AlertTriangle size={20} />
            <strong>Failed to load audit trail</strong>
            <span>{error}</span>
            <Button className="outline-button" onClick={loadAudit}>
              Retry
            </Button>
          </div>
        ) : auditEvents.length === 0 ? (
          <div className="empty-state">
            <ShieldCheck size={20} />
            <strong>No audit events found matching query</strong>
          </div>
        ) : (
          auditEvents.map((event) => {
            const isExpanded = !!expandedIds[event.id]
            return (
              <div key={event.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 18px', borderBottom: '1px solid #e1e9e8' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="audit-hash">{event.id}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <div style={{ fontSize: '11px', color: '#687876', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{event.actor}</span>
                        <span>·</span>
                        <span>{event.timestamp}</span>
                        {event.actionType && (
                          <span className="risk-pill low" style={{ fontSize: '9px', padding: '1px 6px' }}>
                            {event.actionType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Button
                      className="outline-button"
                      onClick={() => togglePayload(event.id)}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      {isExpanded ? 'Hide Payload' : 'View Payload'}
                    </Button>
                    <CheckCircle2 size={16} style={{ color: '#54a884' }} />
                  </div>
                </div>

                <div style={{ fontSize: '10px', color: '#8a9998', fontFamily: 'monospace', background: '#f5f8f8', padding: '6px 10px', borderRadius: '4px' }}>
                  <div>Current Hash: <code>{event.currentHash || event.payloadHash}</code></div>
                  {event.prevHash && (
                    <div style={{ marginTop: '2px' }}>Previous Hash: <code>{event.prevHash}</code></div>
                  )}
                </div>

                {isExpanded && event.payload && (
                  <pre style={{
                    fontSize: '11px',
                    background: '#1e292b',
                    color: '#aedccf',
                    padding: '12px',
                    borderRadius: '6px',
                    overflowX: 'auto',
                    margin: '6px 0 0 0',
                    fontFamily: 'monospace',
                  }}>
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

function AnalyticsView({
  aiCache,
  disputes,
  compensations,
}: {
  aiCache: ParcelAnalysisCache
  disputes: DisputeRecord[]
  compensations: CompensationRecord[]
}) {
  const analyzedCount = Object.keys(aiCache).length
  const totalCompRaw = compensations.reduce((acc, c) => acc + c.rawAmount, 0)
  const openDisputes = disputes.filter((d) => d.status !== 'Resolved').length

  return (
    <>
      <Heading title="Portfolio Analytics & Intelligence" subtitle="Derived metrics combining seeded land datasets & live ML evaluation state." />

      <div className="analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Risk Tier Distribution</h3>
              <p>Calculated across portfolio scope</p>
            </div>
          </div>
          <div className="bars">
            {[
              ['Low', '62', '#54a884'],
              ['Medium', '47', '#e9a23b'],
              ['High', '32', '#df765b'],
              ['Critical', '23', '#b84948'],
            ].map(([label, value, color]) => (
              <div key={label}>
                <span>{label}</span>
                <i>
                  <em style={{ width: `${(Number(value) / 62) * 100}%`, background: color }}></em>
                </i>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Live Session Summary Metrics</h3>
              <p>Real-time app statistics</p>
            </div>
          </div>

          <div className="summary-row">
            <span>
              <strong>ML Analyzed Parcels</strong>
              <small>Evaluated via FastAPI endpoint</small>
            </span>
            <b>{analyzedCount} / 5</b>
          </div>

          <div className="summary-row">
            <span>
              <strong>Active Open Disputes</strong>
              <small>Objections pending resolution</small>
            </span>
            <b>{openDisputes}</b>
          </div>

          <div className="summary-row">
            <span>
              <strong>Total Compensation Exposure</strong>
              <small>Across pending & ready records</small>
            </span>
            <b>Rs {(totalCompRaw / 10000000).toFixed(1)} Cr</b>
          </div>
        </div>
      </div>
    </>
  )
}

function SettingsView({ notify }: { notify: (s: string) => void }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [scope, setScope] = useState('Patna District Zone')

  const resetSession = () => {
    try {
      sessionStorage.removeItem('bhoomisetu-ai-cache')
    } catch {
      // ignore
    }
    notify('Session AI cache cleared. Refreshing page...')
    window.setTimeout(() => window.location.reload(), 1000)
  }

  return (
    <>
      <Heading title="Workspace Settings" subtitle="Configure demo session state, notification behavior, and jurisdiction scope." />

      <div className="panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <strong style={{ fontSize: '13px', color: '#294b55' }}>Officer Jurisdiction Scope</strong>
          <p style={{ fontSize: '10px', color: '#859397', margin: '4px 0 10px' }}>Select district filter for demo operations</p>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #dce8e1', fontSize: '11px' }}>
            <option>Patna District Zone</option>
            <option>Vaishali District Zone</option>
            <option>Gaya District Zone</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #edf1ee', paddingTop: '15px' }}>
          <div>
            <strong style={{ fontSize: '13px', color: '#294b55' }}>System Notifications</strong>
            <p style={{ fontSize: '10px', color: '#859397', margin: '2px 0 0' }}>Receive alerts when high-risk parcels or objections are filed</p>
          </div>
          <Button className={notificationsEnabled ? 'toggle active' : 'toggle'} onClick={() => setNotificationsEnabled(!notificationsEnabled)}>
            <span></span> {notificationsEnabled ? 'Enabled' : 'Disabled'}
          </Button>
        </div>

        <div style={{ borderTop: '1px solid #edf1ee', paddingTop: '15px' }}>
          <strong style={{ fontSize: '13px', color: '#c55643' }}>Reset Demo Session State</strong>
          <p style={{ fontSize: '10px', color: '#859397', margin: '2px 0 10px' }}>Clears local AI prediction cache and reloads default datasets.</p>
          <Button className="outline-button" onClick={resetSession} style={{ color: '#c55643', borderColor: '#f8dcd5' }}>
            <RefreshCw size={14} /> Clear Cache & Reset State
          </Button>
        </div>
      </div>
    </>
  )
}

export default App
