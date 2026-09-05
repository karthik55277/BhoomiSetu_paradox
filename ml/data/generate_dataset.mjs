import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const seed = 26016
const count = 240
const districts = ['Patna', 'Vaishali', 'Gaya', 'Muzaffarpur', 'Nalanda', 'Bhagalpur', 'Bhojpur', 'Saran']
const landTypes = ['Agricultural', 'Residential', 'Commercial', 'Industrial', 'Forest buffer']
const landUses = ['Single-crop', 'Multi-crop', 'Fallow', 'Residential', 'Commercial', 'Mixed use']
const projectTypes = ['Road', 'Rail', 'Water management', 'Industrial corridor', 'Public utility']
const fields = ['record_id', 'state', 'district', 'project_type', 'land_area_ha', 'number_of_owners', 'ownership_complexity', 'previous_dispute', 'previous_objections', 'land_type', 'land_value_cr', 'environmental_risk', 'road_accessibility', 'distance_to_road_km', 'stakeholder_count', 'compensation_exposure_cr', 'land_use_conflict', 'documentation_completeness', 'acquisition_risk', 'risk_score', 'source_label']
let state = seed
const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 }
const pick = values => values[Math.floor(random() * values.length)]
const bounded = (value, low = 0, high = 10) => Math.max(low, Math.min(high, Math.round(value)))
const riskClass = score => score <= 30 ? 0 : score <= 60 ? 1 : score <= 80 ? 2 : 3
const row = index => {
  const area = +(1.2 + random() * 12.8).toFixed(2)
  const owners = 1 + Math.floor(random() * 7)
  const complexity = bounded(owners * 1.15 + (random() * 3.4 - 1.4))
  const dispute = random() < .26 ? 1 : 0
  const objections = dispute ? Math.floor(random() * 5) : pick([0, 0, 1])
  const landType = pick(landTypes); const landUse = pick(landUses); const projectType = pick(projectTypes)
  const environmental = bounded(random() * 8 + (landType === 'Forest buffer' ? 2 : 0))
  const accessibility = bounded(random() * 7 + 3 - (landType === 'Forest buffer' ? 2 : 0))
  const roadDistance = +(0.2 + random() * 7.8).toFixed(2)
  const stakeholders = 2 + Math.floor(random() * 13)
  const documentation = bounded(random() * 5 + 5 - (owners > 4 ? 1.5 : 0))
  const value = +(area * (.25 + random() * .37)).toFixed(2)
  const conflict = bounded(random() * 5 + (landUse === 'Residential' && projectType === 'Road' ? 3 : 0))
  const compensation = +(value * (.92 + random() * .43)).toFixed(2)
  const rawScore = complexity * 3.2 + dispute * 15 + objections * 5 + environmental * 2.6 + (10 - accessibility) * 2.1 + roadDistance * 1.4 + stakeholders * .9 + conflict * 2.8 + (10 - documentation) * 3.4 + (random() * 14 - 7)
  const band = (index - 1) % 4; const ranges = [[0, 30], [31, 60], [61, 80], [81, 100]]; const [low, high] = ranges[band]
  const score = Math.max(low, Math.min(high, Math.round((rawScore + (low + high) / 2) / 2)))
  return [
    `SYN-${String(index).padStart(4, '0')}`, 'Bihar', pick(districts), projectType, area.toFixed(2), owners, complexity, dispute, objections, landType, value.toFixed(2), environmental, accessibility, roadDistance.toFixed(2), stakeholders, compensation.toFixed(2), conflict, documentation, riskClass(score), score, 'synthetic_demo',
  ]
}
const rows = Array.from({ length: count }, (_, i) => row(i + 1))
const csv = [fields, ...rows].map(values => values.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n'
const output = join(dirname(fileURLToPath(import.meta.url)), 'land_acquisition_risk.csv')
writeFileSync(output, csv, 'utf8')
const distribution = rows.reduce((result, current) => { const label = current[18]; result[label] = (result[label] || 0) + 1; return result }, {})
console.log(`Wrote ${rows.length} records to ${output}`)
console.log('Class distribution:', distribution)
