"""Train, compare, evaluate, and save BhoomiSetu risk classifiers."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

try:
    from xgboost import XGBClassifier
except ImportError:
    XGBClassifier = None

from preprocess import DATA_PATH, FEATURES, MODEL_PATH, PREPROCESSOR_PATH, RANDOM_STATE, TARGET, build_preprocessor, load_dataset


def models() -> dict[str, object]:
    result: dict[str, object] = {
        "logistic_regression": LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_STATE),
        "random_forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1),
    }
    if XGBClassifier is not None:
        result["xgboost"] = XGBClassifier(n_estimators=250, max_depth=5, learning_rate=0.05, subsample=0.85, colsample_bytree=0.85, objective="multi:softprob", eval_metric="mlogloss", random_state=RANDOM_STATE, n_jobs=-1)
    return result


def metric_report(actual: pd.Series, predicted: object) -> dict[str, object]:
    return {
        "accuracy": round(float(accuracy_score(actual, predicted)), 4),
        "precision_macro": round(float(precision_score(actual, predicted, average="macro", zero_division=0)), 4),
        "recall_macro": round(float(recall_score(actual, predicted, average="macro", zero_division=0)), 4),
        "f1_macro": round(float(f1_score(actual, predicted, average="macro", zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(actual, predicted, labels=[0, 1, 2, 3]).tolist(),
        "classification_report": classification_report(actual, predicted, labels=[0, 1, 2, 3], output_dict=True, zero_division=0),
    }


def train(data_path: Path = DATA_PATH, model_path: Path = MODEL_PATH, preprocessor_path: Path = PREPROCESSOR_PATH) -> dict[str, object]:
    data = load_dataset(data_path)
    x, y = data[FEATURES], data[TARGET].astype(int)
    x_train, x_holdout, y_train, y_holdout = train_test_split(x, y, test_size=0.30, stratify=y, random_state=RANDOM_STATE)
    x_validation, x_test, y_validation, y_test = train_test_split(x_holdout, y_holdout, test_size=0.50, stratify=y_holdout, random_state=RANDOM_STATE)
    benchmark: dict[str, dict[str, object]] = {}
    fitted: dict[str, Pipeline] = {}
    for name, classifier in models().items():
        pipeline = Pipeline([("preprocessor", build_preprocessor()), ("classifier", classifier)])
        pipeline.fit(x_train, y_train)
        benchmark[name] = metric_report(y_validation, pipeline.predict(x_validation))
        fitted[name] = pipeline
    selected_name = max(benchmark, key=lambda name: benchmark[name]["f1_macro"])
    selected = fitted[selected_name]
    results = metric_report(y_test, selected.predict(x_test))
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(selected, model_path)
    joblib.dump(selected.named_steps["preprocessor"], preprocessor_path)
    metrics = {
        "model_name": selected_name,
        "model_version": "acquisition-risk-0.1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(data_path),
        "dataset_rows": len(data),
        "features": FEATURES,
        "split": {"train": len(x_train), "validation": len(x_validation), "test": len(x_test)},
        "class_distribution": {str(k): int(v) for k, v in y.value_counts().sort_index().items()},
        "xgboost_available": XGBClassifier is not None,
        "validation_benchmarks": benchmark,
        "test_metrics": results,
        "synthetic_data_warning": "Metrics are from synthetic_demo data and are not evidence of real-world accuracy.",
    }
    metrics_path = model_path.with_suffix(".metrics.json")
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--preprocessor", type=Path, default=PREPROCESSOR_PATH)
    args = parser.parse_args()
    print(json.dumps(train(args.data, args.model, args.preprocessor), indent=2))


if __name__ == "__main__":
    main()
