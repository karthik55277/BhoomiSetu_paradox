# Land Acquisition Risk Dataset

`land_acquisition_risk.csv` is a reproducible synthetic demo dataset for the BhoomiSetu primary classification model.

## Target

`acquisition_risk` is encoded as:

- `0`: Low, score `0-30`
- `1`: Medium, score `31-60`
- `2`: High, score `61-80`
- `3`: Critical, score `81-100`

`risk_score` is retained as a transparent demo label used to display a `0-100` score. The later ML model must predict `acquisition_risk` from the feature columns and must not use `risk_score` as an input feature because it is target-derived.

## Features

The dataset includes state, district, project type, land area, owner count, ownership complexity, dispute history, objections, land type, land value, environmental risk, road accessibility, road distance, stakeholder count, compensation exposure, land-use conflict, and documentation completeness.

## Reproducibility

```powershell
python ml/data/generate_dataset.py
```

The generator uses seed `26016` and produces 240 records. Every row has `source_label=synthetic_demo`.

If Python is not installed locally, use the equivalent dependency-free fallback:

```powershell
node ml/data/generate_dataset.mjs
```

## Important limitation

This is synthetic data for pipeline and UI development. It must not be described as historical government data, a validated model-training corpus, or evidence of model accuracy. Before production use, add verified historical outcomes, document label provenance, review class balance, and run privacy and legal checks.
