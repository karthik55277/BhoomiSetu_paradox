import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, ChevronDown, CircleHelp, FileText, Filter, Landmark, LayoutDashboard, Map, Menu, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react'
import { buildParcelRiskInput, explainRisk, formatFeatureName, predictRisk, type ContributorEntry, type RiskExplanationResponse, type RiskPredictionResponse } from './api'
import { getRiskLabel, parcels, projects, stages, type Parcel } from './data'
import './App.css'

type Icon = typeof LayoutDashboard
const navItems: [string, string, Icon][] = [['Dashboard', '/dashboard', LayoutDashboard], ['GIS Map', '/gis', Map], ['Projects', '/projects', Landmark], ['Parcels', '/parcels', FileText], ['AI Engine', '/ai', Sparkles], ['Disputes', '/disputes', AlertTriangle], ['Compensation', '/compensation', Activity], ['Documents', '/documents', FileText], ['Audit Trail', '/audit', ShieldCheck], ['Analytics', '/analytics', Activity]]

function navigate(path: string) { window.location.hash = path }
function useRoute() { const [route, setRoute] = useState(window.location.hash.slice(1) || '/dashboard'); useEffect(() => { const update = () => setRoute(window.location.hash.slice(1) || '/dashboard'); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update) }, []); return route }

async function analyzeParcel(parcel: Parcel): Promise<{ prediction: RiskPredictionResponse; explanation: RiskExplanationResponse }> {
  const payload = buildParcelRiskInput(parcel)
  const [prediction, explanation] = await Promise.all([
    predictRisk(payload),
    explainRisk(payload, 5),
  ])
  return { prediction, explanation }
}
function Button({ children, onClick, className = '', disabled = false }: { children: React.ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) { return <button className={className} onClick={onClick} disabled={disabled}>{children}</button> }

function App() {
  const route = useRoute(); const [selected, setSelected] = useState(parcels[0]); const [menuOpen, setMenuOpen] = useState(false); const [search, setSearch] = useState(''); const [toast, setToast] = useState(''); const [unread, setUnread] = useState(3)
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2500) }
  const routeBase = route.split('/').slice(0, 2).join('/') || '/dashboard'
  const searchResults = useMemo(() => search.length > 1 ? parcels.filter(p => `${p.id} ${p.survey} ${p.owner} ${p.project}`.toLowerCase().includes(search.toLowerCase())) : [], [search])
  const openParcel = (parcel: Parcel) => { setSelected(parcel); navigate(`/parcels/${parcel.id}`) }
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Landmark size={18} /></span><span>Bhoomi<span>Setu</span></span></div><div className="workspace-label">NATIONAL LAND INTELLIGENCE <span>DEMO</span></div><nav>{navItems.map(([label, path, Icon]) => <Button key={path} className={routeBase === path ? 'nav-item active' : 'nav-item'} onClick={() => navigate(path)}><Icon size={16} /><span>{label}</span>{label === 'Disputes' && <b>12</b>}</Button>)}</nav><div className="sidebar-bottom"><Button className="nav-item" onClick={() => navigate('/settings')}><Settings size={16} /><span>Settings</span></Button><Button className="nav-item" onClick={() => notify('Help center opened')}><CircleHelp size={16} /><span>Help center</span></Button><div className="user-mini"><div className="avatar">AK</div><div><strong>Anil Kumar</strong><small>District Officer</small></div></div></div></aside>
    <main className="main-content"><header className="topbar"><Button className="mobile-menu" onClick={() => notify('Use the navigation links to change workspace')}><Menu size={20} /></Button><div className="global-search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search parcel, survey, project, owner..." aria-label="Global search" />{searchResults.length > 0 && <div className="search-results">{searchResults.map(p => <Button key={p.id} onClick={() => { setSearch(''); openParcel(p) }}><strong>{p.id}</strong><span>{p.district} · {p.owner} · Risk {p.risk}</span></Button>)}</div>}</div><div className="top-actions"><div className="demo-badge"><span></span> Seeded demo data</div><Button className="icon-button" onClick={() => { setUnread(0); notify('Notifications marked as read') }}><Bell size={18} />{unread > 0 && <i>{unread}</i>}</Button><Button className="profile-button" onClick={() => setMenuOpen(!menuOpen)}><div className="avatar">AK</div><ChevronDown size={14} /></Button></div>{menuOpen && <div className="profile-menu"><strong>Anil Kumar</strong><small>District Officer · Patna</small><Button onClick={() => notify('Profile opened')}>Profile</Button><Button onClick={() => notify('Preferences opened')}>Preferences</Button><Button onClick={() => notify('Activity opened')}>Activity</Button><Button onClick={() => notify('Signed out of demo')}>Sign out</Button></div>}</header>
      <div className="content-wrap"><Page route={route} selected={selected} setSelected={setSelected} openParcel={openParcel} notify={notify} navigate={navigate} /></div>
    </main>{toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
  </div>
}

function Page({ route, selected, setSelected, openParcel, notify, navigate }: { route: string; selected: Parcel; setSelected: (p: Parcel) => void; openParcel: (p: Parcel) => void; notify: (s: string) => void; navigate: (s: string) => void }) {
  if (route.startsWith('/parcels/')) { const parcelId = route.split('/')[2]; const parcel = parcels.find(p => p.id === parcelId) || selected; return <ParcelProfile parcel={parcel} notify={notify} navigate={navigate} /> }
  if (route === '/parcels') return <ParcelList openParcel={openParcel} />
  if (route === '/gis') return <GIS selected={selected} setSelected={setSelected} openParcel={openParcel} notify={notify} />
  if (route === '/ai') return <AI notify={notify} />
  if (route.startsWith('/projects/')) return <ProjectDetail notify={notify} navigate={navigate} />
  if (route === '/projects') return <Projects notify={notify} navigate={navigate} />
  if (route.startsWith('/disputes/')) return <RecordDetail title="Objection BR-042-0198" subtitle="Dispute detail · NH-327 Ring Road" notify={notify} navigate={navigate} />
  if (route === '/disputes') return <Records title="Disputes" subtitle="Review, assign and resolve objections across active projects." icon={<AlertTriangle />} rows={['Objection BR-042-0198', 'Land-use disagreement BR-042-0191', 'Ownership claim BR-042-0164']} notify={notify} />
  if (route === '/compensation') return <Records title="Compensation tracking" subtitle="31 parcels with pending or in-progress compensation." icon={<Activity />} rows={['BR-042-0187 · Rs 1.86 Cr · Pending approval', 'BR-042-0188 · Rs 2.42 Cr · Processing', 'BR-042-0193 · Rs 3.12 Cr · Ready']} notify={notify} />
  if (route === '/documents') return <Records title="Documents" subtitle="Verified records attached to projects and parcels." icon={<FileText />} rows={['Land title · BR-042-0187', 'Notice of acquisition · NH-327', 'Valuation report · BR-042-0188']} notify={notify} />
  if (route === '/audit') return <Audit />
  if (route === '/analytics') return <Analytics />
  if (route === '/settings') return <Records title="Settings" subtitle="Preferences and configuration for this demo workspace." icon={<Settings />} rows={['Notification preferences', 'Role and geographic scope', 'Data and privacy controls']} notify={notify} />
  return <Dashboard notify={notify} navigate={navigate} openParcel={openParcel} />
}

function Heading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle: string; action?: React.ReactNode }) { return <section className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="subheading">{subtitle}</p></div>{action}</section> }
function Dashboard({ notify, navigate, openParcel }: { notify: (s: string) => void; navigate: (s: string) => void; openParcel: (p: Parcel) => void }) { return <><Heading eyebrow="THURSDAY, 04 SEPTEMBER 2026 · 09:42 IST" title="Good morning, Officer" subtitle="23 items require your attention across Patna district." action={<Button className="primary-button" onClick={() => notify('New project form opened')}>+ New project</Button>} /><section className="kpi-grid">{[['Projects','06','/projects','teal'],['Parcels','148','/parcels','amber'],['High risk','23','/gis','red'],['Disputes','12','/disputes','violet'],['Compensation','Rs 18.4 Cr','/compensation','blue']].map(([label, value, path, color]) => <Button key={label} className="kpi-card" onClick={() => navigate(path)}><span className={`kpi-icon ${color}`}><Activity size={16} /></span><span className="kpi-label">{label}</span><strong>{value}</strong><small>{label === 'High risk' ? 'Needs attention' : '+18 this week'}</small></Button>)}</section><div className="attention-strip"><AlertTriangle size={17} /><div><strong>Priority attention</strong><span>BR-042-0187 has a high risk score and an unresolved ownership objection.</span></div><Button onClick={() => openParcel(parcels[0])}>Review parcel <ArrowRight size={14} /></Button></div><section className="dashboard-grid"><div className="panel map-panel"><div className="panel-head"><div><h3>Live GIS map</h3><p>164 parcels in scope · Click a parcel to inspect</p></div><Button className="quiet-button" onClick={() => navigate('/gis')}>Open map <ArrowRight size={14} /></Button></div><MiniMap openParcel={openParcel} /></div><div className="panel"><div className="panel-head"><div><h3>What needs attention</h3><p>Actionable items for your role</p></div></div><div className="attention-list"><Button onClick={() => openParcel(parcels[0])}><span className="risk-pill high">HIGH</span><div><strong>Ownership objection</strong><small>BR-042-0187 · due today</small></div><ArrowRight size={14} /></Button><Button onClick={() => navigate('/disputes')}><span className="risk-pill medium">12</span><div><strong>Open disputes</strong><small>4 escalated for review</small></div><ArrowRight size={14} /></Button><Button onClick={() => navigate('/compensation')}><span className="risk-pill info">31</span><div><strong>Payments pending</strong><small>Rs 18.4 Cr across projects</small></div><ArrowRight size={14} /></Button></div></div></section><div className="panel activity-panel"><div className="panel-head"><div><h3>Recent activity</h3><p>Immutable events from the acquisition record</p></div><Button className="quiet-button" onClick={() => navigate('/audit')}>View audit <ArrowRight size={14} /></Button></div><div className="activity-list"><ActivityRow icon={<FileText />} text="Notice issued for BR-042-0188" meta="Acquisition Officer · 18 min ago" /><ActivityRow icon={<AlertTriangle />} text="Objection escalated on BR-042-0198" meta="System alert · 42 min ago" /><ActivityRow icon={<CheckCircle2 />} text="Valuation approved for BR-042-0179" meta="District Officer · 1 hr ago" /></div></div></> }
function ActivityRow({ icon, text, meta }: { icon: React.ReactNode; text: string; meta: string }) { return <div className="activity-row"><span>{icon}</span><p><strong>{text}</strong><small>{meta}</small></p></div> }

function MiniMap({ openParcel }: { openParcel: (p: Parcel) => void }) { return <div className="map-canvas mini-map"><div className="map-label">Ganga river</div><div className="road road-a"></div><div className="road road-b"></div>{parcels.map(p => <button key={p.id} aria-label={`Open ${p.id}`} className="parcel" style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }} onClick={() => openParcel(p)}><span>{p.risk}</span></button>)}<div className="map-legend"><span><i className="dot green"></i>Low</span><span><i className="dot orange"></i>Medium</span><span><i className="dot red"></i>High</span></div></div> }

function GIS({ selected, setSelected, openParcel, notify }: { selected: Parcel; setSelected: (p: Parcel) => void; openParcel: (p: Parcel) => void; notify: (s: string) => void }) { const [query, setQuery] = useState(''); const [riskOnly, setRiskOnly] = useState(false); const [analysisLoading, setAnalysisLoading] = useState(false); const [gisAnalysis, setGisAnalysis] = useState<{ prediction: RiskPredictionResponse; explanation: RiskExplanationResponse } | null>(null); const runGISAnalysis = async () => { setAnalysisLoading(true); try { const result = await analyzeParcel(selected); setGisAnalysis(result); notify(`${selected.id} analysis complete · ${result.prediction.risk_level} risk`); } catch (error) { const msg = error instanceof Error ? error.message : 'Analysis failed'; notify(msg); } finally { setAnalysisLoading(false); } }; const shown = parcels.filter(p => (!riskOnly || p.risk > 60) && `${p.id} ${p.survey} ${p.owner}`.toLowerCase().includes(query.toLowerCase())); return <><Heading eyebrow="SPATIAL OPERATIONS · PATNA DISTRICT" title="GIS command center" subtitle="India / Bihar / Patna / NH-327 Ring Road" action={<Button className="primary-button" onClick={() => notify('Map export queued')}>Export view</Button>} /><div className="gis-toolbar"><div className="inline-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search parcel ID or survey number" /></div><Button className={riskOnly ? 'toggle active' : 'toggle'} onClick={() => setRiskOnly(!riskOnly)}><span></span> High risk only</Button><Button className="toggle" onClick={() => notify('Layer controls opened')}><Filter size={15} /> Layers</Button></div><section className="gis-layout"><div className="panel gis-hero"><div className="panel-head"><div><h3>Live parcel layer</h3><p>{shown.length} parcels visible · Spatial data is seeded for demonstration</p></div><span className="live-label"><i></i> MAP LIVE</span></div><div className="map-canvas operational-map"><div className="map-label">Ganga river</div><div className="road road-a"></div><div className="road road-b"></div><div className="road road-c"></div>{shown.map(p => <button key={p.id} aria-label={`Select parcel ${p.id}`} className={selected.id === p.id ? 'parcel selected' : 'parcel'} style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }} onClick={() => setSelected(p)}><span>{p.risk}</span></button>)}<div className="map-legend"><span><i className="dot green"></i>Low risk</span><span><i className="dot orange"></i>Medium</span><span><i className="dot red"></i>High / critical</span></div></div></div><div className="panel gis-side"><div className="panel-head"><div><p className="eyebrow">SELECTED PARCEL</p><h3>{selected.id}</h3></div><span className={`risk-pill ${selected.risk > 60 ? 'high' : 'medium'}`}>{getRiskLabel(selected.risk)}</span></div><div className="gis-stats"><div><small>Risk</small><strong className="risk-high">{gisAnalysis ? Math.round(gisAnalysis.prediction.risk_score) : selected.risk}/100</strong></div><div><small>Suitability</small><strong className="risk-low">{selected.suitability}/100</strong></div><div><small>Delay estimate</small><strong>{selected.delay}</strong></div></div><div className="reason-list"><strong>Why this score?</strong>{gisAnalysis && gisAnalysis.explanation.contributors.length > 0 ? gisAnalysis.explanation.contributors.slice(0, 4).map((c, i) => <span key={i}>{formatFeatureName(c.feature)} <b className={c.impact >= 0 ? '' : 'negative'}>{c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(1)}</b></span>) : <><span>Ownership complexity <b>+21</b></span><span>Previous objection <b>+19</b></span><span>Compensation exposure <b>+15</b></span><span>Road accessibility <b>-5</b></span></>}</div><Button className="primary-button full-button" onClick={runGISAnalysis} disabled={analysisLoading}>{analysisLoading ? 'Analyzing...' : 'Run full analysis'} <Sparkles size={14} /></Button><Button className="outline-button full-button" onClick={() => openParcel(selected)}>Open parcel profile <ArrowRight size={14} /></Button></div></section></> }

function ParcelList({ openParcel }: { openParcel: (p: Parcel) => void }) { const [query, setQuery] = useState(''); const [status, setStatus] = useState('All statuses'); const shown = parcels.filter(p => `${p.id} ${p.survey} ${p.owner}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All statuses' || p.status === status)); return <><Heading title="Parcels" subtitle="Search and review all parcels in your acquisition scope." action={<Button className="primary-button" onClick={() => openParcel(parcels[0])}>Open selected parcel</Button>} /><div className="table-tools"><div className="inline-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search parcel, survey number or owner..." /></div><select value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option>{['Under review', 'Notice issued', 'Survey', 'Identified', 'Objection'].map(s => <option key={s}>{s}</option>)}</select></div><div className="panel table-panel"><table><thead><tr><th>Parcel ID</th><th>District</th><th>Area</th><th>Risk</th><th>Status</th><th>Owner</th><th></th></tr></thead><tbody>{shown.map(p => <tr key={p.id} onClick={() => openParcel(p)}><td><strong>{p.id}</strong><small>{p.survey}</small></td><td>Patna</td><td>{p.area}</td><td><span className={`risk-pill ${p.risk > 60 ? 'high' : p.risk > 30 ? 'medium' : 'low'}`}>{p.risk} {getRiskLabel(p.risk)}</span></td><td>{p.status}</td><td>{p.owner}</td><td><ArrowRight size={15} /></td></tr>)}</tbody></table>{shown.length === 0 && <div className="empty-state"><Search size={22} /><strong>No parcels found</strong><span>Try a different search or reset the status filter.</span></div>}</div></> }

function ParcelProfile({ parcel, notify, navigate }: { parcel: Parcel; notify: (s: string) => void; navigate: (s: string) => void }) { const [profileAnalysisLoading, setProfileAnalysisLoading] = useState(false); const [profileAnalysis, setProfileAnalysis] = useState<{ prediction: RiskPredictionResponse; explanation: RiskExplanationResponse } | null>(null); const runProfileAnalysis = async () => { setProfileAnalysisLoading(true); try { const result = await analyzeParcel(parcel); setProfileAnalysis(result); notify(`${parcel.id} analysis complete · ${result.prediction.risk_level} risk`); } catch (error) { const msg = error instanceof Error ? error.message : 'Analysis failed'; notify(msg); } finally { setProfileAnalysisLoading(false); } }; return <><Button className="back-button" onClick={() => navigate('/parcels')}><ArrowLeft size={15} /> Back to parcels</Button><Heading eyebrow="PARCEL INTELLIGENCE PROFILE · SEEDED RECORD" title={parcel.id} subtitle={`${parcel.district} district · ${parcel.survey} · ${parcel.area}`} action={<Button className="primary-button" onClick={runProfileAnalysis} disabled={profileAnalysisLoading}>{profileAnalysisLoading ? 'Analyzing...' : 'Run full analysis'} <Sparkles size={14} /></Button>} /><div className="profile-grid"><div className="panel detail-panel"><div className="panel-head"><div><h3>Land and ownership</h3><p>Core record information</p></div><span className={`risk-pill ${parcel.risk > 60 ? 'high' : 'medium'}`}>{parcel.status}</span></div><div className="profile-fields"><Field label="Parcel ID" value={parcel.id} /><Field label="Survey number" value={parcel.survey} /><Field label="Land type" value={parcel.landType} /><Field label="Land use" value={parcel.landUse} /><Field label="Primary owner" value={parcel.owner} /><Field label="Ownership complexity" value="Multiple stakeholders" /><Field label="Project" value={parcel.project} /><Field label="Estimated value" value={parcel.value} /></div></div><div className="panel intelligence-panel"><div className="panel-head"><div><h3>AI intelligence</h3><p>Seeded demo prediction · not a trained model output</p></div><Sparkles size={18} className="ai-icon" /></div><div className="ai-score-row"><div><small>Risk</small><strong className="risk-high">{profileAnalysis ? Math.round(profileAnalysis.prediction.risk_score) : parcel.risk}/100</strong><span>{profileAnalysis ? profileAnalysis.prediction.risk_level : getRiskLabel(parcel.risk)}</span></div><div><small>Suitability</small><strong className="risk-low">{parcel.suitability}/100</strong><span>EXCELLENT</span></div><div><small>Delay estimate</small><strong>{parcel.delay}</strong><span>ESTIMATED</span></div></div><div className="progress"><i style={{ width: `${profileAnalysis ? profileAnalysis.prediction.risk_score : parcel.risk}%` }}></i></div><div className="reason-list"><strong>Top risk contributors</strong>{profileAnalysis && profileAnalysis.explanation.contributors.length > 0 ? profileAnalysis.explanation.contributors.slice(0, 4).map((c, i) => <span key={i}>{formatFeatureName(c.feature)} <b className={c.impact >= 0 ? '' : 'negative'}>{c.impact >= 0 ? '+' : '-'}{Math.abs(c.impact).toFixed(1)}</b></span>) : <><span>Ownership complexity <b>+21</b></span><span>Previous dispute <b>+19</b></span><span>Compensation <b>+15</b></span><span>Environmental risk <b>+8</b></span></>}</div></div></div><div className="panel timeline-panel"><div className="panel-head"><div><h3>Acquisition timeline</h3><p>Every transition is recorded in the audit trail</p></div></div><div className="timeline">{stages.map((stage, i) => <div key={stage} className={i < 3 ? 'timeline-step done' : i === 3 ? 'timeline-step current' : 'timeline-step'}><span>{i < 3 ? <Check size={13} /> : i + 1}</span><div><strong>{stage}</strong><small>{i < 3 ? 'Completed · 14 Aug 2026' : i === 3 ? 'Current action required' : 'Pending'}</small></div></div>)}</div></div></> }
function Field({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div> }

function AI({ notify }: { notify: (s: string) => void }) {
  const [running, setRunning] = useState(false)
  const [prediction, setPrediction] = useState<RiskPredictionResponse | null>(null)
  const [explanation, setExplanation] = useState<RiskExplanationResponse | null>(null)

  const run = async () => {
    setRunning(true)
    try {
      const results = await Promise.all(
        parcels.map(async (parcel) => {
          const payload = buildParcelRiskInput(parcel)
          const [predictResult, explainResult] = await Promise.all([
            predictRisk(payload),
            explainRisk(payload, 5),
          ])

          return { parcel, prediction: predictResult, explanation: explainResult }
        }),
      )

      const ranked = results.sort((a, b) => b.prediction.risk_score - a.prediction.risk_score)
      const topResult = ranked[0]
      const lowestRisk = ranked[ranked.length - 1]
      const riskScores = ranked.map((entry) => entry.prediction.risk_score)
      const medianDelay = riskScores.length ? riskScores[Math.floor(riskScores.length / 2)] : 0
      const bestSuitability = lowestRisk ? Math.max(0, 100 - lowestRisk.prediction.risk_score) : 0

      setPrediction(topResult.prediction)
      setExplanation(topResult.explanation)

      const message = `${topResult.parcel.id} scored ${topResult.prediction.risk_level} risk.`
      notify(message)

      const syntheticSummary = {
        highestRisk: topResult.prediction.risk_score,
        highestRiskLevel: topResult.prediction.risk_level,
        bestSuitability,
        medianDelay,
      }

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('bhoomisetu-ai-summary', JSON.stringify(syntheticSummary))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI analysis failed'
      notify(message)
    } finally {
      setRunning(false)
    }
  }

  const topPositive = explanation?.top_positive_contributors ?? []
  const topNegative = explanation?.top_negative_contributors ?? []
  const allContributors = explanation?.contributors ?? []
  const highestImpact = allContributors.length ? Math.max(...allContributors.map((entry) => Math.abs(entry.impact))) : 1

  const topRiskValue = prediction?.risk_score ?? 74
  const topRiskLabel = prediction?.risk_level ?? 'HIGH'
  const bestSuitabilityValue = prediction ? Math.max(0, 100 - prediction.risk_score) : 94
  const medianDelayValue = prediction ? `${Math.max(1, Math.round(prediction.risk_score / 11))} mo` : '5.8 mo'

  return (
    <>
      <Heading
        eyebrow="DECISION SUPPORT · MODEL V0.1-DEMO"
        title="AI land intelligence"
        subtitle="Risk, suitability and delay signals for project decisions. Demo values are clearly labeled."
        action={
          <Button className="primary-button" onClick={run} disabled={running}>
            {running ? 'Analyzing...' : 'Analyze candidate parcels'}
            <Sparkles size={14} />
          </Button>
        }
      />

      <div className="ai-banner">
        <Sparkles size={20} />
        <div>
          <strong>Decision support, not an automated decision</strong>
          <span>Use these explanations to prioritize review. Authorized officers make the final acquisition decision.</span>
        </div>
        <span className="demo-tag">SEEDED / DEMO</span>
      </div>

      <div className="ai-workspace">
        <div className="panel ai-overview">
          <div className="panel-head">
            <div>
              <h3>NH-327 Ring Road</h3>
              <p>Candidate parcel ranking · 5 parcels evaluated</p>
            </div>
            <select>
              <option>NH-327 Ring Road</option>
              <option>Ganga Flood Resilience</option>
            </select>
          </div>

          <div className="ai-score-cards">
            <div>
              <small>Highest risk</small>
              <strong className="risk-high">{topRiskValue} / 100</strong>
              <span>{topRiskLabel}</span>
            </div>
            <div>
              <small>Best suitability</small>
              <strong className="risk-low">{bestSuitabilityValue.toFixed(0)} / 100</strong>
              <span>{bestSuitabilityValue >= 80 ? 'EXCELLENT' : bestSuitabilityValue >= 60 ? 'GOOD' : 'REVIEW'}</span>
            </div>
            <div>
              <small>Median delay</small>
              <strong>{medianDelayValue}</strong>
              <span>ESTIMATED</span>
            </div>
          </div>

          <div className="rank-list">
            {[...parcels].sort((a, b) => b.risk - a.risk).map((p, i) => (
              <div key={p.id}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{p.id}</strong>
                  <small>{p.area} · {p.landUse}</small>
                </span>
                <i className="suitability-bar"><em style={{ width: `${p.suitability}%` }}></em></i>
                <strong className="rank-score">{p.suitability}</strong>
                <Button onClick={() => notify(`${p.id} selected for review`)}><ArrowRight size={14} /></Button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel contributors">
          <div className="panel-head">
            <div>
              <h3>Risk explanation</h3>
              <p>{explanation ? explanation.risk_level : 'HIGH'} risk · {prediction ? `${prediction.risk_score} / 100` : '74 / 100'}</p>
            </div>
          </div>

          <div className="reason-list">
            <strong>Top increases</strong>
            {topPositive.length > 0 ? topPositive.slice(0, 3).map((entry, index) => (
              <div key={`${entry.feature}-${index}`} className="small-reason">
                <span>{formatFeatureName(entry.feature)}</span>
                <b>+{Math.abs(entry.impact).toFixed(2)}</b>
              </div>
            )) : (
              <>
                <div className="small-reason"><span>Ownership complexity</span><b>+21.00</b></div>
                <div className="small-reason"><span>Previous dispute</span><b>+19.00</b></div>
                <div className="small-reason"><span>Compensation exposure</span><b>+15.00</b></div>
              </>
            )}
          </div>

          <div className="reason-list">
            <strong>Top reductions</strong>
            {topNegative.length > 0 ? topNegative.slice(0, 3).map((entry, index) => (
              <div key={`${entry.feature}-${index}`} className="small-reason">
                <span>{formatFeatureName(entry.feature)}</span>
                <b className="negative">-{Math.abs(entry.impact).toFixed(2)}</b>
              </div>
            )) : (
              <>
                <div className="small-reason"><span>Road accessibility</span><b className="negative">-5.00</b></div>
                <div className="small-reason"><span>Documentation completeness</span><b className="negative">-3.00</b></div>
                <div className="small-reason"><span>Stakeholder count</span><b className="negative">-2.00</b></div>
              </>
            )}
          </div>

          <div className="contributor-list">
            {allContributors.length > 0 ? allContributors.map((entry: ContributorEntry) => {
              const normalizedWidth = Math.max(8, (Math.abs(entry.impact) / highestImpact) * 100)
              return (
                <div key={`${entry.feature}-${entry.direction}`} className="contributor">
                  <span>{formatFeatureName(entry.feature)}</span>
                  <b className={entry.impact >= 0 ? '' : 'negative'}>
                    {entry.impact >= 0 ? '+' : '-'}{Math.abs(entry.impact).toFixed(2)}
                  </b>
                  <i><em style={{ width: `${normalizedWidth}%` }}></em></i>
                </div>
              )
            }) : (
              <>
                <div className="contributor"><span>Ownership complexity</span><b>+21</b><i><em style={{ width: '84%' }}></em></i></div>
                <div className="contributor"><span>Previous dispute</span><b>+19</b><i><em style={{ width: '76%' }}></em></i></div>
                <div className="contributor"><span>Compensation exposure</span><b>+15</b><i><em style={{ width: '60%' }}></em></i></div>
                <div className="contributor"><span>Environmental risk</span><b>+8</b><i><em style={{ width: '32%' }}></em></i></div>
                <div className="contributor"><span>Road accessibility</span><b className="negative">-5</b><i><em style={{ width: '20%' }}></em></i></div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Projects({ notify, navigate }: { notify: (s: string) => void; navigate: (s: string) => void }) { return <><Heading title="Projects" subtitle="Manage active acquisition programs and their next actions." action={<Button className="primary-button" onClick={() => notify('New project form opened')}>+ New project</Button>} /><div className="project-grid">{projects.map(p => <Button key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}><div><span className="project-code">{p.id}</span><span className="status-label">{p.status}</span></div><h3>{p.name}</h3><p>{p.type} · {p.district} district</p><div className="project-progress"><span><strong>{p.progress}%</strong> complete</span><span>{p.parcels} parcels</span><i><em style={{ width: `${p.progress}%` }}></em></i></div><small>Target date · {p.target} <ArrowRight size={14} /></small></Button>)}</div></> }
function ProjectDetail({ notify, navigate }: { notify: (s: string) => void; navigate: (s: string) => void }) { return <><Button className="back-button" onClick={() => navigate('/projects')}><ArrowLeft size={15} /> Back to projects</Button><Heading eyebrow="PROJECT WORKSPACE · NH-327" title="Patna Ring Road Expansion" subtitle="Road infrastructure · Patna district · Target 31 Mar 2027" action={<Button className="primary-button" onClick={() => notify('Project update saved')}>Update project</Button>} /><div className="project-tabs"><Button className="active">Overview</Button><Button onClick={() => notify('Project parcels loaded')}>Parcels</Button><Button onClick={() => notify('Workflow loaded')}>Workflow</Button><Button onClick={() => notify('Documents loaded')}>Documents</Button><Button onClick={() => notify('Project AI loaded')}>AI</Button><Button onClick={() => notify('Project audit loaded')}>Audit</Button></div><div className="project-detail-grid"><div className="panel project-overview"><div className="panel-head"><div><h3>Acquisition progress</h3><p>Current state distribution across 164 parcels</p></div><strong className="big-progress">68%</strong></div><div className="large-progress"><i style={{ width: '68%' }}></i></div><div className="stage-grid">{stages.map((stage, i) => <div key={stage} className={i < 4 ? 'done' : i === 4 ? 'current' : ''}><span>{i < 4 ? <Check size={13} /> : i + 1}</span><strong>{stage}</strong><small>{i < 4 ? 'Complete' : i === 4 ? '12 pending' : 'Pending'}</small></div>)}</div></div><div className="panel"><div className="panel-head"><div><h3>Pending actions</h3><p>Next steps for officers</p></div></div><div className="action-list"><Button onClick={() => notify('Objection review opened')}><AlertTriangle size={15} /><span><strong>Review 4 escalated objections</strong><small>Due today</small></span><ArrowRight size={14} /></Button><Button onClick={() => notify('Valuation queue opened')}><Activity size={15} /><span><strong>Approve 8 valuations</strong><small>Due 06 Sep 2026</small></span><ArrowRight size={14} /></Button><Button onClick={() => notify('Compensation queue opened')}><CheckCircle2 size={15} /><span><strong>Release 12 compensation records</strong><small>Due 08 Sep 2026</small></span><ArrowRight size={14} /></Button></div></div></div></> }
function Records({ title, subtitle, icon, rows, notify }: { title: string; subtitle: string; icon: React.ReactNode; rows: string[]; notify: (s: string) => void }) { return <><Heading title={title} subtitle={subtitle} action={<Button className="primary-button" onClick={() => notify(`New ${title.toLowerCase()} record opened`)}>+ New record</Button>} /><div className="record-layout"><div className="panel record-list">{rows.map((row, i) => <Button key={row} onClick={() => notify(`${row} opened`)}><span className={`record-icon ${i === 0 ? 'red' : 'blue'}`}>{icon}</span><span><strong>{row}</strong><small>NH-327 Ring Road · Updated today</small></span><ArrowRight size={15} /></Button>)}</div><div className="panel empty-state"><ShieldCheck size={25} /><strong>Select a record to inspect</strong><span>Detailed information, assignments and audit history will appear here.</span></div></div></> }
function RecordDetail({ title, subtitle, notify, navigate }: { title: string; subtitle: string; notify: (s: string) => void; navigate: (s: string) => void }) { return <><Button className="back-button" onClick={() => navigate('/disputes')}><ArrowLeft size={15} /> Back to disputes</Button><Heading eyebrow="DISPUTE DETAIL · SEEDED RECORD" title={title} subtitle={subtitle} action={<Button className="primary-button" onClick={() => notify('Dispute marked resolved')}>Resolve dispute <Check size={14} /></Button>} /><div className="record-layout"><div className="panel detail-panel"><div className="panel-head"><div><h3>Objection summary</h3><p>Submitted by landowner · 02 Sep 2026</p></div><span className="risk-pill high">HIGH PRIORITY</span></div><div className="profile-fields"><Field label="Parcel" value="BR-042-0198" /><Field label="Category" value="Ownership claim" /><Field label="Assigned to" value="Anil Kumar" /><Field label="Status" value="Under review" /><Field label="Description" value="Ownership share requires additional verification." /><Field label="Next action" value="Review title documents" /></div></div><div className="panel empty-state"><ShieldCheck size={25} /><strong>Audit history</strong><span>Created 02 Sep · assigned 03 Sep · escalation recorded 04 Sep</span></div></div></> }
function Audit() { return <><Heading title="Audit trail" subtitle="Tamper-evident history of important acquisition events." /><div className="audit-health"><ShieldCheck size={20} /><div><strong>Hash chain healthy</strong><span>All 148 recorded events verified · Last checked 09:38 IST</span></div><span className="status-label">VERIFIED</span></div><div className="panel audit-list">{['Valuation approved · BR-042-0179', 'Objection escalated · BR-042-0198', 'Notice issued · BR-042-0188', 'Parcel status updated · BR-042-0187'].map((x, i) => <div key={x}><span className="audit-hash">{i + 1}</span><span><strong>{x}</strong><small>Anil Kumar · 04 Sep 2026 · payload hash 8f3a...c91e</small></span><CheckCircle2 size={15} /></div>)}</div></> }
function Analytics() { return <><Heading title="Analytics" subtitle="Portfolio signals across geography, risk and acquisition progress." /><div className="analytics-grid"><div className="panel chart-panel"><div className="panel-head"><div><h3>Risk distribution</h3><p>164 parcels · current portfolio</p></div></div><div className="bars">{[['Low','62','#54a884'],['Medium','47','#e9a23b'],['High','32','#df765b'],['Critical','23','#b84948']].map(([label, value, color]) => <div key={label}><span>{label}</span><i><em style={{ width: `${Number(value) / 62 * 100}%`, background: color }}></em></i><strong>{value}</strong></div>)}</div></div><div className="panel"><div className="panel-head"><div><h3>Portfolio summary</h3><p>By active project</p></div></div>{projects.map(p => <div className="summary-row" key={p.id}><span><strong>{p.id}</strong><small>{p.name}</small></span><b>{p.progress}%</b></div>)}</div></div></> }

export default App
