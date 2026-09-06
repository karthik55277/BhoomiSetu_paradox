import React, { useState } from 'react'
import { RefreshCw, X, Sparkles, ArrowRight } from 'lucide-react'
import { loginApi } from '../api/auth'

interface DemoStoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSwitchUser: (user: any) => void
  onNavigateTab: (tab: string) => void
  onNotify: (msg: string) => void
}

export const DemoStoryModal: React.FC<DemoStoryModalProps> = ({
  isOpen,
  onClose,
  onSwitchUser,
  onNavigateTab,
  onNotify,
}) => {
  const [currentStep, setCurrentStep] = useState(1)
  const [resetting, setResetting] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  if (!isOpen) return null

  const steps = [
    {
      step: 1,
      title: '1. Field Surveyor Identity & Mobile App',
      role: 'field_surveyor (Ramesh Verma)',
      description: 'Authenticate as Field Surveyor Ramesh Verma and launch the mobile-first field inspection app.',
      actionLabel: 'Login as Ramesh Verma & Open Field App',
      onExecute: async () => {
        setLoggingIn(true)
        try {
          const tokenRes = await loginApi({ email: 'ramesh.verma@bhoomisetu.gov.in' })
          onSwitchUser(tokenRes.user)
          onNavigateTab('field')
          onNotify('Logged in as Ramesh Verma (Field Surveyor) · Switched to /field')
          setCurrentStep(2)
        } catch (err) {
          onNotify(err instanceof Error ? err.message : 'Login failed')
        } finally {
          setLoggingIn(false)
        }
      },
    },
    {
      step: 2,
      title: '2. GPS Spatial Proximity & PostGIS Search',
      role: 'field_surveyor',
      description: 'Discover nearby high-risk parcels in Patna using PostGIS ST_DWithin and ST_Distance spatial calculations bounded by jurisdiction.',
      actionLabel: 'Explore Nearby Parcels in Patna',
      onExecute: async () => {
        onNavigateTab('field')
        onNotify('PostGIS Spatial Query: Returning parcels within 5km of Patna coordinates')
        setCurrentStep(3)
      },
    },
    {
      step: 3,
      title: '3. Offline Evidence & IndexedDB Queue',
      role: 'field_surveyor',
      description: 'Capture ground photo & field notes in Offline Mode. Metadata and raw image binary blobs are saved securely in browser IndexedDB.',
      actionLabel: 'Proceed to Field Sync Step',
      onExecute: async () => {
        onNavigateTab('field')
        onNotify('Demonstrate Offline Toggle: Capture evidence photo -> Stored in IndexedDB queue')
        setCurrentStep(4)
      },
    },
    {
      step: 4,
      title: '4. Instant Multi-Engine Synchronization',
      role: 'field_surveyor',
      description: 'Toggle Online Mode -> Syncs MinIO S3 photo, PostgreSQL PostGIS inspection record, SHA-256 Audit Event, and WebSocket broadcast.',
      actionLabel: 'View Sync Pipeline',
      onExecute: async () => {
        onNavigateTab('field')
        onNotify('Sync Pipeline: MinIO Storage + PostgreSQL + Audit SHA-256 + WebSocket Alert')
        setCurrentStep(5)
      },
    },
    {
      step: 5,
      title: '5. District Officer Command Center Alerts',
      role: 'district_officer (Anil Kumar)',
      description: 'Switch identity to District Officer Anil Kumar. Real-time WebSocket toast alerts notify the officer instantly upon surveyor sync.',
      actionLabel: 'Login as Anil Kumar & Open Dashboard',
      onExecute: async () => {
        setLoggingIn(true)
        try {
          const tokenRes = await loginApi({ email: 'anil.kumar@bhoomisetu.gov.in' })
          onSwitchUser(tokenRes.user)
          onNavigateTab('dashboard')
          onNotify('Logged in as Anil Kumar (District Officer) · Real-time WebSocket alerts active')
          setCurrentStep(6)
        } catch (err) {
          onNotify(err instanceof Error ? err.message : 'Login failed')
        } finally {
          setLoggingIn(false)
        }
      },
    },
    {
      step: 6,
      title: '6. AI Risk Scoring (SHAP) & Dispute Escalation',
      role: 'district_officer',
      description: 'Inspect 19-feature SHAP risk contributors, evaluate land acquisition risk, and review complete cryptographic SHA-256 audit trail.',
      actionLabel: 'View AI Intelligence & Audit Trail',
      onExecute: async () => {
        onNavigateTab('ai')
        onNotify('Opened AI Risk Intelligence: Reviewing SHAP feature contributions & SHA-256 Audit Chain')
      },
    },
  ]

  const handleResetDemoData = async () => {
    setResetting(true)
    try {
      const token = localStorage.getItem('bhoomisetu_token') || localStorage.getItem('bhoomisetu_access_token')
      const res = await fetch('/api/v1/demo/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Reset failed')
      }
      const data = await res.json()
      onNotify(`🎬 ${data.message}`)
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to reset demo data')
    } finally {
      setResetting(false)
    }
  }

  const active = steps.find((s) => s.step === currentStep) || steps[0]

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={22} color="#fbbf24" />
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px', fontWeight: 600 }}>
              BhoomiSetu Hackathon Demo Story Mode
            </h3>
          </div>
          <button style={closeButtonStyle} onClick={onClose} title="Close Modal">
            <X size={18} />
          </button>
        </div>

        <div style={stepContainerStyle}>
          {steps.map((s) => (
            <div
              key={s.step}
              onClick={() => setCurrentStep(s.step)}
              style={{
                ...stepPillStyle,
                ...(s.step === currentStep ? activeStepPillStyle : {}),
              }}
            >
              <span>Step {s.step}</span>
            </div>
          ))}
        </div>

        <div style={bodyStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={roleBadgeStyle}>{active.role}</span>
          </div>
          <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8', fontSize: '16px' }}>{active.title}</h4>
          <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>
            {active.description}
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={active.onExecute}
              disabled={loggingIn}
              style={actionButtonStyle}
            >
              {loggingIn ? 'Authenticating...' : active.actionLabel} <ArrowRight size={16} />
            </button>

            {currentStep < 6 && (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                style={nextButtonStyle}
              >
                Next Step
              </button>
            )}
          </div>
        </div>

        <div style={footerStyle}>
          <button
            onClick={handleResetDemoData}
            disabled={resetting}
            style={resetButtonStyle}
            title="Restores seed baseline data for predictable hackathon presentations"
          >
            <RefreshCw size={14} className={resetting ? 'spin' : ''} />
            {resetting ? 'Resetting Demo State...' : '🎬 Reset Demo Data to Baseline'}
          </button>
        </div>
      </div>
    </div>
  )
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
}

const modalContentStyle: React.CSSProperties = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '640px',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  borderBottom: '1px solid #334155',
  backgroundColor: '#0f172a',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
}

const stepContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  padding: '12px 20px',
  backgroundColor: '#1e293b',
  borderBottom: '1px solid #334155',
  overflowX: 'auto',
}

const stepPillStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: '16px',
  fontSize: '12px',
  fontWeight: 600,
  backgroundColor: '#0f172a',
  color: '#64748b',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: '1px solid #334155',
}

const activeStepPillStyle: React.CSSProperties = {
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderColor: '#38bdf8',
}

const bodyStyle: React.CSSProperties = {
  padding: '20px',
}

const roleBadgeStyle: React.CSSProperties = {
  backgroundColor: 'rgba(56, 189, 248, 0.15)',
  color: '#38bdf8',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const actionButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 18px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}

const nextButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  backgroundColor: '#334155',
  color: '#f8fafc',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  backgroundColor: '#0f172a',
  borderTop: '1px solid #334155',
  display: 'flex',
  justifyContent: 'flex-end',
}

const resetButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  backgroundColor: 'rgba(239, 68, 68, 0.15)',
  color: '#f87171',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
}
