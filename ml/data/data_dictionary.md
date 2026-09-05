# BhoomiSetu Land Acquisition Dataset Dictionary

## Provenance

`land_acquisition_dataset.csv` is **synthetic/demo data** generated deterministically for demonstration, preprocessing development, and model-development experiments. It does **not** represent real government records, verified historical outcomes, or any live government integration. Do not use it for operational decisions.

The generator is `ml/src/generate_land_acquisition_dataset.mjs`. It creates 2,400 records with seed `26016` and labels every record with a `SYN-LA-` identifier.

## Target and Feature Columns

| Column | Type | Description | Expected values / unit |
|---|---|---|---|
| `parcel_id` | string | Synthetic parcel identifier | `SYN-LA-00001` format; identifier only, not a model feature |
| `state` | categorical | State associated with the parcel | Bihar, Jharkhand, Uttar Pradesh |
| `district` | categorical | District associated with the parcel | Synthetic district category |
| `land_area` | numeric | Parcel area | hectares |
| `land_type` | categorical | Broad land classification | Agricultural, Residential, Commercial, Industrial, Forest buffer |
| `land_use` | categorical | Current or observed use | Single-crop, Multi-crop, Fallow, Residential, Commercial, Mixed use |
| `number_of_owners` | integer | Count of recorded owners | 1-8 owners |
| `ownership_complexity` | integer | Complexity of ownership and title structure | 0-10; higher means more complex |
| `previous_dispute` | binary | Whether a prior dispute is recorded | 0 = no, 1 = yes |
| `previous_objections` | integer | Count of prior objections | 0-4 |
| `land_value` | numeric | Estimated base land value | crore rupees; synthetic |
| `estimated_compensation` | numeric | Estimated compensation exposure | crore rupees; synthetic |
| `environmental_risk` | integer | Environmental constraint or sensitivity signal | 0-10; higher means greater risk |
| `road_accessibility` | integer | Accessibility from existing roads | 0-10; higher means easier access |
| `distance_to_road` | numeric | Distance from parcel to nearest road | kilometres |
| `project_type` | categorical | Type of acquiring project | Road, Rail, Water management, Industrial corridor, Public utility |
| `stakeholder_count` | integer | Number of stakeholders involved | 2-20 |
| `land_use_conflict` | integer | Conflict between current use and project needs | 0-10; higher means greater conflict |
| `documentation_completeness` | integer | Completeness of available documentation | 0-10; higher means more complete |
| `historical_acquisition_duration` | numeric | Historical reference duration for similar acquisition patterns | months |
| `acquisition_risk` | integer | Primary classification target | 0 = Low, 1 = Medium, 2 = High, 3 = Critical |
| `acquisition_duration` | numeric | Regression target for expected acquisition duration | months; synthetic estimate, not a guarantee |

## Target relationships

The synthetic labels are generated from relationships among ownership complexity, disputes, objections, environmental risk, accessibility, road distance, stakeholder count, land-use conflict, documentation completeness, and historical duration. Higher complexity, disputes, environmental constraints, distance, conflict, and historical duration generally increase risk and duration. Better accessibility and documentation generally reduce them.

The dataset contains missing values in feature columns to make preprocessing realistic. Target columns are always populated. A future training pipeline should impute numeric values, impute/encode categorical values, validate ranges, and exclude `parcel_id` from model inputs.
