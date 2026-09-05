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

export const notifications = [
  { id: 1, title: 'High-risk parcel detected', detail: 'BR-042-0187 · Ownership complexity', type: 'risk', read: false, parcelId: 'BR-042-0187' },
  { id: 2, title: 'New objection submitted', detail: 'BR-042-0191 · Review requested', type: 'dispute', read: false, parcelId: 'BR-042-0191' },
  { id: 3, title: 'Valuation approved', detail: 'BR-042-0172 · Compensation ready', type: 'success', read: false, parcelId: 'BR-042-0188' },
]

export const stages = ['Identified', 'Survey', 'Notice', 'Valuation', 'Objection', 'Compensation', 'Approval', 'Acquired']

export const getRiskLabel = (risk: number) => risk <= 30 ? 'LOW' : risk <= 60 ? 'MEDIUM' : risk <= 80 ? 'HIGH' : 'CRITICAL'
