"""Run a saved BhoomiSetu acquisition risk model on one parcel JSON record."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd

from preprocess import FEATURES, MODEL_PATH
from explain import explain

LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH", 3: "CRITICAL"}


def predict(record: dict[str, object], model_path: Path = MODEL_PATH) -> dict[str, object]:
    missing = sorted(set(FEATURES) - set(record))
    if missing:
        raise ValueError(f"Missing prediction features: {missing}")
    model = joblib.load(model_path)
    frame = pd.DataFrame([record], columns=FEATURES)
    predicted_class = int(model.predict(frame)[0])
    explanation = explain(record, model_path)
    return {
        "acquisition_risk": predicted_class,
        "risk_probability": explanation["risk_probability"],
        "risk_score": explanation["risk_score"],
        "risk_level": explanation["risk_level"],
        "contributors": explanation["contributors"],
        "explanation_method": explanation["explanation_method"],
        "model": str(model_path),
        "explanation": explanation,
        "synthetic_data_warning": "The trained artifact is based on synthetic_demo data and is not for operational decisions.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--input", type=Path, required=True, help="JSON file containing one record's model features")
    args = parser.parse_args()
    print(json.dumps(predict(json.loads(args.input.read_text(encoding="utf-8")), args.model), indent=2))


if __name__ == "__main__":
    main()
