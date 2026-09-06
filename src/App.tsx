import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown, CircleHelp, Download, FileText, Layers, Landmark, LayoutDashboard, Map, Menu, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Upload } from 'lucide-react'
import {
  buildParcelRiskInput,
  explainRisk,
  fetchParcelDetail,
  fetchParcels,
  fetchProjectByCode,
  fetchProjects,
  formatFeatureName,
  predictRisk,
  type ApiParcelDetailResponse,
  type ApiProjectDetailResponse,
  type ParcelAnalysis,
  type ParcelAnalysisCache,
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
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  title?: string
  style?: React.CSSProperties
}) {
  return (
    <button className={className} onClick={onClick} disabled={disabled} title={title} style={style}>
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

  // Central AI Fetcher with Shared Cache
  const getOrFetchParcelAnalysis = async (parcel: Parcel, forceRefresh = false): Promise<ParcelAnalysis> => {
    if (!forceRefresh && aiCache[parcel.id]) {
      return aiCache[parcel.id]
    }

    setAnalyzingMap((prev) => ({ ...prev, [parcel.id]: true }))
    try {
      const payload = buildParcelRiskInput(parcel)
      const [prediction, explanation] = await Promise.all([
        predictRisk(payload),
        explainRisk(payload, 5),
      ])

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
            setDisputes={setDisputes}
            compensations={compensations}
            setCompensations={setCompensations}
            documents={documents}
            setDocuments={setDocuments}
            auditEvents={auditEvents}
            setAuditEvents={setAuditEvents}
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
  setDisputes,
  compensations,
  setCompensations,
  documents,
  setDocuments,
  auditEvents,
  setAuditEvents,
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
  setDisputes: React.Dispatch<React.SetStateAction<DisputeRecord[]>>
  compensations: CompensationRecord[]
  setCompensations: React.Dispatch<React.SetStateAction<CompensationRecord[]>>
  documents: DocumentRecord[]
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>
  auditEvents: AuditEvent[]
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>
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
  if (route === '/ai') return <AI notify={notify} aiCache={aiCache} getOrFetchParcelAnalysis={getOrFetchParcelAnalysis} analyzingMap={analyzingMap} />
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
    const dispute = disputes.find((d) => d.id === dispId) || disputes[0]
    return <DisputeDetail dispute={dispute} setDisputes={setDisputes} setAuditEvents={setAuditEvents} notify={notify} navigate={navigate} />
  }
  if (route === '/disputes') return <DisputesView disputes={disputes} notify={notify} navigate={navigate} />
  if (route === '/compensation') return <CompensationView compensations={compensations} setCompensations={setCompensations} notify={notify} />
  if (route === '/documents') return <DocumentsView documents={documents} setDocuments={setDocuments} notify={notify} />
  if (route === '/audit') return <AuditView auditEvents={auditEvents} />
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

  const currentAnalysis = aiCache[selected.id]

  const runGISAnalysis = async () => {
    try {
      await getOrFetchParcelAnalysis(selected, true)
    } catch {
      // Error handled in getOrFetchParcelAnalysis
    }
  }

  const exportView = () => {
    const summary = `BHOOMISETU GIS EXPORT REPORT\nDate: ${new Date().toLocaleDateString()}\nParcel: ${selected.id}\nDistrict: ${selected.district}\nArea: ${selected.area}\nLand Use: ${selected.landUse}\nRisk Score: ${currentAnalysis ? currentAnalysis.prediction.risk_score : selected.risk} / 100\nRisk Level: ${currentAnalysis ? currentAnalysis.prediction.risk_level : getRiskLabel(selected.risk)}\n`
    const blob = new Blob([summary], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GIS_Export_${selected.id}.txt`
    a.click()
    URL.revokeObjectURL(url)
    notify(`Export report generated for ${selected.id}`)
  }

  const shown = parcels.filter((p) => {
    const cached = aiCache[p.id]
    const score = cached ? cached.prediction.risk_score : p.risk
    const matchesRisk = !riskOnly || score > 60
    const matchesSearch = `${p.id} ${p.survey} ${p.owner}`.toLowerCase().includes(query.toLowerCase())
    return matchesRisk && matchesSearch
  })

  return (
    <>
      <Heading eyebrow="SPATIAL OPERATIONS · PATNA DISTRICT" title="GIS Command Center" subtitle="India / Bihar / Patna / NH-327 Ring Road" action={<Button className="primary-button" onClick={exportView}><Download size={14} /> Export view</Button>} />

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
      </div>

      {showLayerModal && (
        <div className="panel" style={{ padding: '14px 19px', marginBottom: '14px', background: '#f8faf9', border: '1px solid #dbe8e1' }}>
          <strong style={{ fontSize: '11px', color: '#294b55', display: 'block', marginBottom: '8px' }}>Demo GIS Layer Controls</strong>
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

      <section className="gis-layout">
        <div className="panel gis-hero">
          <div className="panel-head">
            <div>
              <h3>Live parcel spatial view</h3>
              <p>{shown.length} parcels visible · Click a marker to select</p>
            </div>
            <span className="live-label">
              <i></i> MAP LIVE
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
  aiCache,
  getOrFetchParcelAnalysis,
  analyzingMap,
}: {
  notify: (s: string) => void
  aiCache: ParcelAnalysisCache
  getOrFetchParcelAnalysis: (p: Parcel, force?: boolean) => Promise<ParcelAnalysis>
  analyzingMap: Record<string, boolean>
}) {
  const [running, setRunning] = useState(false)

  const runBatchAnalysis = async () => {
    setRunning(true)
    try {
      await Promise.all(parcels.map((p) => getOrFetchParcelAnalysis(p, true)))
      notify('All candidate parcels analyzed using live ML pipeline.')
    } catch {
      notify('Some parcels failed during batch ML evaluation.')
    } finally {
      setRunning(false)
    }
  }

  // Derive rankings from shared aiCache + parcels
  const evaluatedList = parcels.map((p) => {
    const cached = aiCache[p.id]
    return {
      parcel: p,
      riskScore: cached ? cached.prediction.risk_score : p.risk,
      riskLevel: cached ? cached.prediction.risk_level : getRiskLabel(p.risk),
      isAnalyzed: !!cached,
      contributors: cached ? cached.explanation.contributors : [],
    }
  })

  const sortedByRisk = [...evaluatedList].sort((a, b) => b.riskScore - a.riskScore)
  const topEvaluated = sortedByRisk[0]
  const isAnyAnalyzed = evaluatedList.some((item) => item.isAnalyzed)

  const highestRiskScore = Math.round(topEvaluated.riskScore)
  const highestRiskLevel = topEvaluated.riskLevel
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
        <span className="demo-tag">DEMO SESSION STATE</span>
      </div>

      <div className="ai-workspace">
        <div className="panel ai-overview">
          <div className="panel-head">
            <div>
              <h3>NH-327 Ring Road Candidate Ranking</h3>
              <p>{evaluatedList.filter((e) => e.isAnalyzed).length} of {parcels.length} parcels analyzed with ML model</p>
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
              <div key={item.parcel.id}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{item.parcel.id}</strong>
                  <small>
                    {item.parcel.area} · {item.parcel.landUse} · {item.isAnalyzed ? 'ML Verified' : 'Seeded'}
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
              <p>{topEvaluated.parcel.id} · Top Feature Attributions</p>
            </div>
          </div>

          {topEvaluated.contributors.length > 0 ? (
            <div className="reason-list">
              <strong>ML Model SHAP Contributors ({topEvaluated.parcel.id})</strong>
              {topEvaluated.contributors.map((c, i) => (
                <div key={i} className="small-reason" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0' }}>
                  <span>{formatFeatureName(c.feature)}</span>
                  <b className={c.impact >= 0 ? '' : 'negative'} style={{ color: c.impact >= 0 ? '#c45c49' : '#4d9a78' }}>
                    {c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(2)}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Sparkles size={24} />
              <strong>No ML analysis cached for top parcel</strong>
              <span>Click "Analyze All Candidate Parcels" above to calculate live SHAP values.</span>
            </div>
          )}

          {!isAnyAnalyzed && (
            <div style={{ padding: '15px 19px', fontSize: '10px', color: '#889896' }}>
              <em>Note: Risk scores currently reflect initial seeded baselines. Click "Analyze All Candidate Parcels" to trigger the FastAPI backend model.</em>
            </div>
          )}
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
  disputes,
  notify,
  navigate,
}: {
  disputes: DisputeRecord[]
  notify: (s: string) => void
  navigate: (s: string) => void
}) {
  const [query, setQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')

  const filtered = disputes.filter((d) => {
    const matchesSearch = `${d.id} ${d.parcelId} ${d.category} ${d.assignedTo}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = filterStatus === 'All' || d.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <>
      <Heading title="Disputes & Objections" subtitle="Review, assign, and resolve land acquisition objections across active projects." action={<Button className="primary-button" onClick={() => notify('New dispute form: Contact district legal cell')}>+ File New Objection</Button>} />

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dispute ID, parcel ID, category, or officer..." />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option>All</option>
          <option>Under review</option>
          <option>Escalated</option>
          <option>In mediation</option>
          <option>Resolved</option>
        </select>
      </div>

      <div className="record-layout">
        <div className="panel record-list">
          {filtered.map((d) => (
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
          ))}
          {filtered.length === 0 && (
            <div className="empty-state">
              <AlertTriangle size={20} />
              <strong>No disputes found matching filter</strong>
            </div>
          )}
        </div>

        <div className="panel empty-state">
          <ShieldCheck size={25} />
          <strong>Select a dispute record to inspect details</strong>
          <span>Review legal claims, reassign officers, or mark objections resolved in demo session state.</span>
        </div>
      </div>
    </>
  )
}

function DisputeDetail({
  dispute,
  setDisputes,
  setAuditEvents,
  notify,
  navigate,
}: {
  dispute: DisputeRecord
  setDisputes: React.Dispatch<React.SetStateAction<DisputeRecord[]>>
  setAuditEvents: React.Dispatch<React.SetStateAction<AuditEvent[]>>
  notify: (s: string) => void
  navigate: (s: string) => void
}) {
  const toggleResolve = () => {
    const nextStatus: DisputeRecord['status'] = dispute.status === 'Resolved' ? 'Under review' : 'Resolved'
    setDisputes((prev) => prev.map((d) => (d.id === dispute.id ? { ...d, status: nextStatus } : d)))

    if (nextStatus === 'Resolved') {
      setAuditEvents((prev) => [
        {
          id: `AUD-${Date.now().toString().slice(-4)}`,
          title: `Dispute ${dispute.id} resolved by District Officer`,
          parcelId: dispute.parcelId,
          projectId: dispute.projectId,
          actor: 'Anil Kumar',
          timestamp: `${new Date().toLocaleDateString()} · ${new Date().toLocaleTimeString()} IST`,
          payloadHash: Math.random().toString(16).substring(2, 14),
          status: 'VERIFIED',
        },
        ...prev,
      ])
    }

    notify(`Dispute ${dispute.id} status updated to ${nextStatus}`)
  }

  const changePriority = (p: 'HIGH' | 'MEDIUM' | 'LOW') => {
    setDisputes((prev) => prev.map((d) => (d.id === dispute.id ? { ...d, priority: p } : d)))
    notify(`Dispute ${dispute.id} priority set to ${p}`)
  }

  return (
    <>
      <Button className="back-button" onClick={() => navigate('/disputes')}>
        <ArrowLeft size={15} /> Back to disputes list
      </Button>
      <Heading
        eyebrow="DISPUTE DETAIL · DEMO SESSION STATE"
        title={`Objection ${dispute.id}`}
        subtitle={`${dispute.category} · Parcel ${dispute.parcelId} · Project ${dispute.projectId}`}
        action={
          <Button className="primary-button" onClick={toggleResolve}>
            {dispute.status === 'Resolved' ? 'Re-open Dispute' : 'Mark Resolved'} <Check size={14} />
          </Button>
        }
      />

      <div className="record-layout">
        <div className="panel detail-panel">
          <div className="panel-head">
            <div>
              <h3>Objection Summary</h3>
              <p>Submitted on {dispute.date}</p>
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
          </div>

          <div style={{ padding: '0 19px 19px' }}>
            <small style={{ color: '#8a9998', fontSize: '9px', display: 'block', marginBottom: '4px' }}>Claim Description</small>
            <p style={{ margin: 0, fontSize: '11px', color: '#3d5b60', lineHeight: 1.4 }}>{dispute.description}</p>
          </div>

          <div style={{ padding: '0 19px 19px', display: 'flex', gap: '10px' }}>
            <Button className="outline-button" onClick={() => changePriority('HIGH')}>Set Priority High</Button>
            <Button className="outline-button" onClick={() => changePriority('MEDIUM')}>Set Priority Medium</Button>
          </div>
        </div>

        <div className="panel empty-state">
          <ShieldCheck size={25} />
          <strong>Audit History & Legal Logs</strong>
          <span>Created on {dispute.date} · Priority: {dispute.priority} · Current Status: {dispute.status}</span>
        </div>
      </div>
    </>
  )
}

function CompensationView({
  compensations,
  setCompensations,
  notify,
}: {
  compensations: CompensationRecord[]
  setCompensations: React.Dispatch<React.SetStateAction<CompensationRecord[]>>
  notify: (s: string) => void
}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  const filtered = compensations.filter((c) => {
    const matchesSearch = `${c.id} ${c.parcelId} ${c.payee}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const cycleStatus = (id: string) => {
    setCompensations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const order: CompensationRecord['status'][] = ['Pending approval', 'Processing', 'Ready', 'Released']
        const nextIdx = (order.indexOf(c.status) + 1) % order.length
        const nextStatus = order[nextIdx]
        notify(`Compensation record ${c.id} updated to ${nextStatus}`)
        return { ...c, status: nextStatus }
      }),
    )
  }

  return (
    <>
      <Heading title="Compensation Tracking Queue" subtitle="Monitor valuation approvals and disbursement status across parcels." action={<Button className="primary-button" onClick={() => notify('Batch payout export generated')}>Export Payout Schedule</Button>} />

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search compensation ID, parcel ID, or payee name..." />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option>All</option>
          <option>Pending approval</option>
          <option>Processing</option>
          <option>Ready</option>
          <option>Released</option>
        </select>
      </div>

      <div className="panel table-panel">
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
            {filtered.map((c) => (
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
                  <span className={`risk-pill ${c.status === 'Released' ? 'low' : c.status === 'Ready' ? 'info' : 'medium'}`}>{c.status}</span>
                </td>
                <td>
                  <Button className="outline-button" onClick={() => cycleStatus(c.id)}>
                    Advance Status
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DocumentsView({
  documents,
  setDocuments,
  notify,
}: {
  documents: DocumentRecord[]
  setDocuments: React.Dispatch<React.SetStateAction<DocumentRecord[]>>
  notify: (s: string) => void
}) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const filtered = documents.filter((doc) => {
    const matchesSearch = `${doc.id} ${doc.title} ${doc.parcelId}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const mockUpload = () => {
    const newDoc: DocumentRecord = {
      id: `DOC-${Date.now().toString().slice(-3)}`,
      title: `Verification record · Parcel BR-042-0193`,
      parcelId: 'BR-042-0193',
      projectId: 'NH-327',
      category: 'Survey Map',
      status: 'Verified',
      fileSize: '3.6 MB',
      uploadedAt: 'Today',
    }
    setDocuments((prev) => [newDoc, ...prev])
    notify('Demo document uploaded to current session')
  }

  return (
    <>
      <Heading title="Document Repository" subtitle="Verified titles, survey maps, and valuation files." action={<Button className="primary-button" onClick={mockUpload}><Upload size={14} /> Upload Demo Document</Button>} />

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search document title or parcel ID..." />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option>All</option>
          <option>Land Title</option>
          <option>Acquisition Notice</option>
          <option>Valuation Report</option>
          <option>Objection Filing</option>
          <option>Survey Map</option>
        </select>
      </div>

      <div className="panel table-panel">
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
            {filtered.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <strong>{doc.title}</strong>
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
      </div>
    </>
  )
}

function AuditView({ auditEvents }: { auditEvents: AuditEvent[] }) {
  const [query, setQuery] = useState('')

  const filtered = auditEvents.filter((a) => `${a.title} ${a.actor} ${a.payloadHash} ${a.parcelId ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <Heading title="Tamper-Evident Audit Trail" subtitle="Cryptographic hash log of acquisition workflow events." />

      <div className="audit-health">
        <ShieldCheck size={20} />
        <div>
          <strong>Hash Chain Healthy (Demo Chain)</strong>
          <span>All {auditEvents.length} recorded events verified · Last checked 09:38 IST</span>
        </div>
        <span className="status-label">VERIFIED</span>
      </div>

      <div className="table-tools">
        <div className="inline-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search audit events, actor, or payload hash..." />
        </div>
      </div>

      <div className="panel audit-list">
        {filtered.map((event, i) => (
          <div key={event.id}>
            <span className="audit-hash">{i + 1}</span>
            <span>
              <strong>{event.title}</strong>
              <small>
                {event.actor} · {event.timestamp} · payload hash <code>{event.payloadHash}</code>
              </small>
            </span>
            <CheckCircle2 size={15} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <ShieldCheck size={20} />
            <strong>No audit events found matching query</strong>
          </div>
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
