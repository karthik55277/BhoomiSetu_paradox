export type Parcel = {
  id: string
  survey: string
  district: string
  area: string
  status: string
  risk: number
  suitability: number
  delay: string
  x: number
  y: number
  color: string
  owner: string
  landType: string
  landUse: string
  project: string
  value: string
  dispute: boolean
}

export type DisputeRecord = {
  id: string
  parcelId: string
  projectId: string
  category: string
  assignedTo: string
  status: 'Under review' | 'Escalated' | 'In mediation' | 'Resolved'
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  date: string
}

export type CompensationRecord = {
  id: string
  parcelId: string
  projectId: string
  amount: string
  rawAmount: number
  payee: string
  status: 'Pending approval' | 'Processing' | 'Ready' | 'Released'
  date: string
}

export type DocumentRecord = {
  id: string
  title: string
  parcelId: string
  projectId: string
  category: 'Land Title' | 'Acquisition Notice' | 'Valuation Report' | 'Objection Filing' | 'Survey Map'
  status: 'Verified' | 'Pending' | 'Flagged'
  fileSize: string
  uploadedAt: string
}

export type AuditEvent = {
  id: string
  title: string
  parcelId?: string
  projectId?: string
  actor: string
  timestamp: string
  payloadHash: string
  status: 'VERIFIED'
}

export const parcels: Parcel[] = [
  { id: 'BR-042-0187', survey: 'Survey 18/7A', district: 'Patna', area: '4.82 ha', status: 'Under review', risk: 74, suitability: 86, delay: '7.2 months', x: 34, y: 29, color: '#e9a23b', owner: 'S. K. Prasad', landType: 'Agricultural', landUse: 'Multi-crop', project: 'NH-327 Ring Road', value: 'Rs 1.86 Cr', dispute: true },
  { id: 'BR-042-0188', survey: 'Survey 18/7B', district: 'Patna', area: '7.10 ha', status: 'Notice issued', risk: 28, suitability: 91, delay: '4.1 months', x: 55, y: 25, color: '#54a884', owner: 'Meera Devi', landType: 'Agricultural', landUse: 'Single-crop', project: 'NH-327 Ring Road', value: 'Rs 2.42 Cr', dispute: false },
  { id: 'BR-042-0191', survey: 'Survey 21/2', district: 'Patna', area: '3.46 ha', status: 'Survey', risk: 46, suitability: 72, delay: '5.8 months', x: 76, y: 39, color: '#e9a23b', owner: 'R. N. Singh', landType: 'Residential', landUse: 'Residential', project: 'NH-327 Ring Road', value: 'Rs 1.18 Cr', dispute: true },
  { id: 'BR-042-0193', survey: 'Survey 21/4A', district: 'Patna', area: '9.25 ha', status: 'Identified', risk: 18, suitability: 94, delay: '3.6 months', x: 66, y: 66, color: '#54a884', owner: 'Lakshmi Kumari', landType: 'Agricultural', landUse: 'Fallow', project: 'NH-327 Ring Road', value: 'Rs 3.12 Cr', dispute: false },
  { id: 'BR-042-0198', survey: 'Survey 25/1', district: 'Patna', area: '5.70 ha', status: 'Objection', risk: 86, suitability: 63, delay: '9.4 months', x: 28, y: 67, color: '#d8634d', owner: 'A. Rahman', landType: 'Residential', landUse: 'Residential', project: 'NH-327 Ring Road', value: 'Rs 2.04 Cr', dispute: true },
]

export const projects = [
  { id: 'NH-327', name: 'Patna Ring Road Expansion', type: 'Road infrastructure', district: 'Patna', parcels: 164, progress: 68, status: 'Active', target: '31 Mar 2027' },
  { id: 'BR-118', name: 'Ganga Flood Resilience', type: 'Water management', district: 'Vaishali', parcels: 87, progress: 42, status: 'Active', target: '15 Nov 2027' },
  { id: 'PN-204', name: 'North Freight Corridor', type: 'Rail infrastructure', district: 'Gaya', parcels: 236, progress: 21, status: 'Planning', target: '30 Jun 2028' },
]

export const initialDisputes: DisputeRecord[] = [
  { id: 'DSP-0198', parcelId: 'BR-042-0198', projectId: 'NH-327', category: 'Ownership claim', assignedTo: 'Anil Kumar', status: 'Escalated', priority: 'HIGH', description: 'Co-owner submitted objection regarding inheritance distribution and share calculation.', date: '02 Sep 2026' },
  { id: 'DSP-0191', parcelId: 'BR-042-0191', projectId: 'NH-327', category: 'Land-use disagreement', assignedTo: 'Priya Sharma', status: 'Under review', priority: 'MEDIUM', description: 'Landowner disputes residential valuation rate vs agricultural market comparison.', date: '31 Aug 2026' },
  { id: 'DSP-0187', parcelId: 'BR-042-0187', projectId: 'NH-327', category: 'Boundary misalignment', assignedTo: 'Anil Kumar', status: 'Under review', priority: 'HIGH', description: 'Survey demarcation overlaps with adjacent government canal easement.', date: '28 Aug 2026' },
  { id: 'DSP-0164', parcelId: 'BR-042-0164', projectId: 'BR-118', category: 'Compensation dispute', assignedTo: 'R. K. Verma', status: 'In mediation', priority: 'MEDIUM', description: 'Claimant requesting tree and crop loss additions to base valuation.', date: '25 Aug 2026' },
]

export const initialCompensations: CompensationRecord[] = [
  { id: 'CMP-0187', parcelId: 'BR-042-0187', projectId: 'NH-327', amount: 'Rs 1.86 Cr', rawAmount: 18600000, payee: 'S. K. Prasad', status: 'Pending approval', date: '01 Sep 2026' },
  { id: 'CMP-0188', parcelId: 'BR-042-0188', projectId: 'NH-327', amount: 'Rs 2.42 Cr', rawAmount: 24200000, payee: 'Meera Devi', status: 'Processing', date: '03 Sep 2026' },
  { id: 'CMP-0191', parcelId: 'BR-042-0191', projectId: 'NH-327', amount: 'Rs 1.18 Cr', rawAmount: 11800000, payee: 'R. N. Singh', status: 'Pending approval', date: '29 Aug 2026' },
  { id: 'CMP-0193', parcelId: 'BR-042-0193', projectId: 'NH-327', amount: 'Rs 3.12 Cr', rawAmount: 31200000, payee: 'Lakshmi Kumari', status: 'Ready', date: '04 Sep 2026' },
  { id: 'CMP-0198', parcelId: 'BR-042-0198', projectId: 'NH-327', amount: 'Rs 2.04 Cr', rawAmount: 20400000, payee: 'A. Rahman', status: 'Pending approval', date: '02 Sep 2026' },
]

export const initialDocuments: DocumentRecord[] = [
  { id: 'DOC-101', title: 'Land title certificate · BR-042-0187', parcelId: 'BR-042-0187', projectId: 'NH-327', category: 'Land Title', status: 'Verified', fileSize: '2.4 MB', uploadedAt: '12 Aug 2026' },
  { id: 'DOC-102', title: 'Notice of acquisition Section 4 · NH-327', parcelId: 'BR-042-0188', projectId: 'NH-327', category: 'Acquisition Notice', status: 'Verified', fileSize: '1.8 MB', uploadedAt: '18 Aug 2026' },
  { id: 'DOC-103', title: 'District valuation report · BR-042-0188', parcelId: 'BR-042-0188', projectId: 'NH-327', category: 'Valuation Report', status: 'Verified', fileSize: '4.1 MB', uploadedAt: '22 Aug 2026' },
  { id: 'DOC-104', title: 'Objection petition · BR-042-0198', parcelId: 'BR-042-0198', projectId: 'NH-327', category: 'Objection Filing', status: 'Flagged', fileSize: '3.2 MB', uploadedAt: '02 Sep 2026' },
  { id: 'DOC-105', title: 'Cadastral survey map · Survey 21/4A', parcelId: 'BR-042-0193', projectId: 'NH-327', category: 'Survey Map', status: 'Verified', fileSize: '8.7 MB', uploadedAt: '29 Jul 2026' },
]

export const initialAuditEvents: AuditEvent[] = [
  { id: 'AUD-001', title: 'Valuation approved for BR-042-0179', parcelId: 'BR-042-0179', projectId: 'NH-327', actor: 'District Officer (Anil Kumar)', timestamp: '04 Sep 2026 · 09:14 IST', payloadHash: '8f3a92b4c91e', status: 'VERIFIED' },
  { id: 'AUD-002', title: 'Objection escalated on BR-042-0198', parcelId: 'BR-042-0198', projectId: 'NH-327', actor: 'System Alert', timestamp: '04 Sep 2026 · 08:32 IST', payloadHash: '72e118f9a44b', status: 'VERIFIED' },
  { id: 'AUD-003', title: 'Notice of acquisition issued for BR-042-0188', parcelId: 'BR-042-0188', projectId: 'NH-327', actor: 'Acquisition Officer', timestamp: '03 Sep 2026 · 16:45 IST', payloadHash: '3d90cc11b22e', status: 'VERIFIED' },
  { id: 'AUD-004', title: 'Parcel status updated to Under Review for BR-042-0187', parcelId: 'BR-042-0187', projectId: 'NH-327', actor: 'Anil Kumar', timestamp: '01 Sep 2026 · 11:20 IST', payloadHash: '11aef884210c', status: 'VERIFIED' },
  { id: 'AUD-005', title: 'Compensation ready state recorded for BR-042-0193', parcelId: 'BR-042-0193', projectId: 'NH-327', actor: 'Finance Desk', timestamp: '30 Aug 2026 · 14:10 IST', payloadHash: '990b71cf552a', status: 'VERIFIED' },
]

export const notifications = [
  { id: 1, title: 'High-risk parcel detected', detail: 'BR-042-0187 · Ownership complexity', type: 'risk', read: false, parcelId: 'BR-042-0187' },
  { id: 2, title: 'New objection submitted', detail: 'BR-042-0191 · Review requested', type: 'dispute', read: false, parcelId: 'BR-042-0191' },
  { id: 3, title: 'Valuation approved', detail: 'BR-042-0172 · Compensation ready', type: 'success', read: false, parcelId: 'BR-042-0188' },
]

export const stages = ['Identified', 'Survey', 'Notice', 'Valuation', 'Objection', 'Compensation', 'Approval', 'Acquired']

export const getRiskLabel = (risk: number) => risk <= 30 ? 'LOW' : risk <= 60 ? 'MEDIUM' : risk <= 80 ? 'HIGH' : 'CRITICAL'
