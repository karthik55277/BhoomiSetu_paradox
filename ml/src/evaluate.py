"""Evaluate a saved acquisition risk model on a deterministic test split."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split

from preprocess import DATA_PATH, FEATURES, RANDOM_STATE, TARGET, load_dataset


def evaluate(model_path: Path, data_path: Path = DATA_PATH) -> dict[str, object]:
    data = load_dataset(data_path)
    x = data[FEATURES]
    y = data[TARGET].astype(int)
    _, x_holdout, _, y_holdout = train_test_split(x, y, test_size=0.30, random_state=RANDOM_STATE, stratify=y)
    _, x_test, _, y_test = train_test_split(x_holdout, y_holdout, test_size=0.50, random_state=RANDOM_STATE, stratify=y_holdout)
    model = joblib.load(model_path)
    prediction = model.predict(x_test)
    return {
        "accuracy": round(float(accuracy_score(y_test, prediction)), 4),
        "precision_macro": round(float(precision_score(y_test, prediction, average="macro", zero_division=0)), 4),
        "recall_macro": round(float(recall_score(y_test, prediction, average="macro", zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_test, prediction, average="macro", zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_test, prediction, labels=[0, 1, 2, 3]).tolist(),
        "classification_report": classification_report(y_test, prediction, labels=[0, 1, 2, 3], output_dict=True, zero_division=0),
        "classes": {"0": "LOW", "1": "MEDIUM", "2": "HIGH", "3": "CRITICAL"},
        "synthetic_data_warning": "These metrics describe synthetic_demo data and do not indicate real-world accuracy.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("ml/models/acquisition_risk_model.pkl"))
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--output", type=Path, default=Path("ml/models/evaluation.json"))
    args = parser.parse_args()
    results = evaluate(args.model, args.data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
