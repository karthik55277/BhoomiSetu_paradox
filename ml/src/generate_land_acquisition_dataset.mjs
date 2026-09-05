import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEED = 26016
const ROWS = 2400
const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'land_acquisition_dataset.csv')
const districts = ['Patna', 'Vaishali', 'Gaya', 'Muzaffarpur', 'Nalanda', 'Bhagalpur', 'Bhojpur', 'Saran', 'Ranchi', 'Dhanbad', 'Purnia', 'Begusarai']
const landTypes = ['Agricultural', 'Residential', 'Commercial', 'Industrial', 'Forest buffer']
const landUses = ['Single-crop', 'Multi-crop', 'Fallow', 'Residential', 'Commercial', 'Mixed use']
const projectTypes = ['Road', 'Rail', 'Water management', 'Industrial corridor', 'Public utility']
const fields = ['parcel_id', 'state', 'district', 'land_area', 'land_type', 'land_use', 'number_of_owners', 'ownership_complexity', 'previous_dispute', 'previous_objections', 'land_value', 'estimated_compensation', 'environmental_risk', 'road_accessibility', 'distance_to_road', 'project_type', 'stakeholder_count', 'land_use_conflict', 'documentation_completeness', 'historical_acquisition_duration', 'acquisition_risk', 'acquisition_duration']
let state = SEED
const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296 }
const pick = values => values[Math.floor(random() * values.length)]
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const round = (value, places = 2) => Number(value.toFixed(places))
const maybeMissing = value => random() < 0.045 ? '' : value
const riskClass = score => score <= 30 ? 0 : score <= 60 ? 1 : score <= 80 ? 2 : 3

const rows = Array.from({ length: ROWS }, (_, index) => {
  const landArea = round(0.8 + random() * 24.2)
  const numberOfOwners = 1 + Math.floor(random() * 8)
  const ownershipComplexity = Math.round(clamp(numberOfOwners * 1.05 + random() * 3.2 - 1, 0, 10))
  const previousDispute = random() < 0.22 ? 1 : 0
  const previousObjections = previousDispute ? Math.floor(random() * 5) : (random() < 0.18 ? 1 : 0)
  const landType = pick(landTypes)
  const landUse = pick(landUses)
  const projectType = pick(projectTypes)
  const environmentalRisk = Math.round(clamp(random() * 8 + (landType === 'Forest buffer' ? 2 : 0) + (projectType === 'Water management' ? 1 : 0), 0, 10))
  const roadAccessibility = Math.round(clamp(random() * 7 + 3 - (landType === 'Forest buffer' ? 2 : 0), 0, 10))
  const distanceToRoad = round(0.1 + random() * 12)
  const stakeholderCount = 2 + Math.floor(random() * 19)
  const landValue = round(landArea * (0.18 + random() * 0.7))
  const estimatedCompensation = round(landValue * (1.02 + random() * 0.38))
  const landUseConflict = Math.round(clamp(random() * 5 + (landUse === 'Residential' && projectType === 'Road' ? 3 : 0) + (landUse === 'Commercial' && projectType === 'Rail' ? 2 : 0), 0, 10))
  const documentationCompleteness = Math.round(clamp(random() * 5 + 5 - (numberOfOwners > 5 ? 2 : 0), 0, 10))
  const historicalDuration = round(3 + numberOfOwners * 0.55 + previousObjections * 0.9 + random() * 8)
  const rawRisk = ownershipComplexity * 3.3 + previousDispute * 15 + previousObjections * 4.5 + environmentalRisk * 2.4 + (10 - roadAccessibility) * 2.2 + distanceToRoad * 1.1 + stakeholderCount * 0.8 + landUseConflict * 2.7 + (10 - documentationCompleteness) * 3.5 + historicalDuration * 1.25 + random() * 14 - 7
  const riskScore = clamp(Math.round(rawRisk / 1.25 - 20), 0, 100)
  const acquisitionDuration = round(clamp(historicalDuration + previousDispute * 1.4 + previousObjections * 0.75 + landUseConflict * 0.3 + (10 - documentationCompleteness) * 0.35 + random() * 3 - 1.5, 2, 48))
  const values = [
    `SYN-LA-${String(index + 1).padStart(5, '0')}`, pick(['Bihar', 'Jharkhand', 'Uttar Pradesh']), pick(districts), landArea, landType, landUse, numberOfOwners, ownershipComplexity, previousDispute, previousObjections, landValue, estimatedCompensation, environmentalRisk, roadAccessibility, distanceToRoad, projectType, stakeholderCount, landUseConflict, documentationCompleteness, historicalDuration, riskClass(riskScore), acquisitionDuration,
  ]
  return values.map((value, position) => position >= 20 ? value : maybeMissing(value))
})

const csv = [fields, ...rows].map(values => values.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n'
writeFileSync(output, csv, 'utf8')
const distribution = rows.reduce((result, row) => { result[row[20]] = (result[row[20]] || 0) + 1; return result }, {})
console.log(`Wrote ${rows.length} records to ${output}`)
console.log('Risk distribution:', distribution)
