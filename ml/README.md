# BhoomiSetu ML Pipeline

The primary model is a four-class classifier for `acquisition_risk`:

```text
0 = LOW       (score 0-30)
1 = MEDIUM    (score 31-60)
2 = HIGH      (score 61-80)
3 = CRITICAL  (score 81-100)
```

## Install

From the repository root:

```powershell
python -m pip install -r ml/requirements.txt
```

## Train and evaluate

```powershell
python ml/src/train.py
```

The pipeline:

1. Reads and validates `ml/data/land_acquisition_dataset.csv`.
2. Uses numeric median imputation with missingness indicators.
3. Uses categorical most-frequent imputation and one-hot encoding.
4. Standardizes numeric features.
5. Creates stratified 70/15/15 train, validation, and test splits.
6. Benchmarks Logistic Regression and Random Forest, plus XGBoost when installed.
7. Uses class-balanced Logistic Regression and Random Forest settings when imbalance is present.
8. Selects primarily by validation macro-F1, then evaluates once on the held-out test set.
9. Saves the complete model pipeline, standalone preprocessing pipeline, and JSON metrics under `ml/models/`.

## Outputs

Training creates:

- `ml/models/acquisition_risk_model.pkl`
- `ml/models/acquisition_risk_preprocessor.pkl`
- `ml/models/acquisition_risk_model.metrics.json`

Evaluation can be rerun independently:

```powershell
python ml/src/evaluate.py
```

The evaluation report includes accuracy, macro precision, macro recall, macro F1, per-class metrics, and the 4x4 confusion matrix.

Prediction for a JSON record containing the model feature columns:

```powershell
python ml/src/predict.py --input parcel_features.json
```

Explain one prediction directly:

```powershell
python ml/src/explain.py --input parcel_features.json
```

The explanation response contains the predicted class and ranked signed contributors, for example `ownership_complexity` with `direction=increases_risk`. SHAP is used when installed. If SHAP is unavailable, the response identifies the fallback method explicitly; fallback feature importance must not be presented as exact causal attribution.

The response also includes `risk_probability`, which is the model probability for the predicted class, and `risk_score`, a model-derived 0-100 severity score calculated from the probability-weighted risk classes. `top_positive_contributors` and `top_negative_contributors` are generated from the model explanation values; they are not hardcoded UI numbers.

XGBoost is optional at runtime. If it is unavailable, training continues with Logistic Regression and Random Forest. SHAP is optional at runtime for local explanations and is included in `ml/requirements.txt`.

All current records are synthetic demo data. Reported metrics must not be presented as real-world accuracy until verified historical outcomes are available.
