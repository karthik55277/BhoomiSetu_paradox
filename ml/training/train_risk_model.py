"""Train and evaluate BhoomiSetu's land acquisition risk classifier."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SEED = 26016
TARGET = "acquisition_risk"
LEAKAGE_COLUMNS = {"record_id", "risk_score", "source_label"}
CATEGORICAL_FEATURES = ["state", "district", "project_type", "land_type", "land_use"]
NUMERIC_FEATURES = [
    "land_area_ha", "number_of_owners", "ownership_complexity", "previous_dispute",
    "previous_objections", "land_value_cr", "environmental_risk", "road_accessibility",
    "distance_to_road_km", "stakeholder_count", "compensation_exposure_cr",
    "land_use_conflict", "documentation_completeness",
]
MODEL_VERSION = "risk-model-0.1.0"


def make_preprocessor() -> ColumnTransformer:
    return ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ("numeric", StandardScaler(), NUMERIC_FEATURES),
    ])


def make_models() -> dict[str, Pipeline]:
    return {
        "logistic_regression": Pipeline([
            ("preprocessor", make_preprocessor()),
            ("classifier", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED)),
        ]),
        "random_forest": Pipeline([
            ("preprocessor", make_preprocessor()),
            ("classifier", RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=SEED, n_jobs=-1)),
        ]),
    }


def validate_dataset(data: pd.DataFrame) -> None:
    required = set(CATEGORICAL_FEATURES + NUMERIC_FEATURES + [TARGET, "risk_score", "source_label"])
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    if data.empty:
        raise ValueError("Dataset is empty")
    if not set(data[TARGET].unique()).issubset({0, 1, 2, 3}):
        raise ValueError("acquisition_risk must contain only classes 0, 1, 2, 3")
    if data["source_label"].nunique() != 1 or data["source_label"].iloc[0] != "synthetic_demo":
        raise ValueError("Unexpected source label; review provenance before training")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path("ml/data/land_acquisition_risk.csv"))
    parser.add_argument("--output", type=Path, default=Path("ml/models"))
    args = parser.parse_args()

    data = pd.read_csv(args.data)
    validate_dataset(data)
    features = data.drop(columns=[TARGET, *LEAKAGE_COLUMNS])
    target = data[TARGET]
    x_train, x_holdout, y_train, y_holdout = train_test_split(features, target, test_size=0.30, random_state=SEED, stratify=target)
    x_validation, x_test, y_validation, y_test = train_test_split(x_holdout, y_holdout, test_size=0.50, random_state=SEED, stratify=y_holdout)

    results: dict[str, dict[str, object]] = {}
    trained: dict[str, Pipeline] = {}
    for name, model in make_models().items():
        model.fit(x_train, y_train)
        validation_prediction = model.predict(x_validation)
        results[name] = {
            "validation_macro_f1": round(float(f1_score(y_validation, validation_prediction, average="macro")), 4),
            "validation_accuracy": round(float(accuracy_score(y_validation, validation_prediction)), 4),
        }
        trained[name] = model

    selected_name = max(results, key=lambda name: results[name]["validation_macro_f1"])
    selected_model = trained[selected_name]
    test_prediction = selected_model.predict(x_test)
    results[selected_name]["test_macro_f1"] = round(float(f1_score(y_test, test_prediction, average="macro")), 4)
    results[selected_name]["test_accuracy"] = round(float(accuracy_score(y_test, test_prediction)), 4)
    results[selected_name]["test_report"] = classification_report(y_test, test_prediction, output_dict=True, zero_division=0)

    args.output.mkdir(parents=True, exist_ok=True)
    artifact_path = args.output / f"{MODEL_VERSION}.joblib"
    metrics_path = args.output / f"{MODEL_VERSION}.metrics.json"
    joblib.dump(selected_model, artifact_path)
    metrics = {
        "model_name": selected_name,
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(args.data),
        "dataset_rows": len(data),
        "features": list(features.columns),
        "split": {"train": len(x_train), "validation": len(x_validation), "test": len(x_test)},
        "class_distribution": {str(key): int(value) for key, value in target.value_counts().sort_index().items()},
        "benchmarks": results,
        "synthetic_data_warning": "Metrics are not evidence of real-world accuracy; dataset rows are synthetic_demo.",
    }
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({"selected_model": selected_name, "artifact": str(artifact_path), "metrics": str(metrics_path), "test_macro_f1": results[selected_name]["test_macro_f1"]}, indent=2))


if __name__ == "__main__":
    main()
