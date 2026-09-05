"""Generate local, model-backed explanations for acquisition risk predictions."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from preprocess import DATA_PATH, FEATURES, MODEL_PATH

LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH", 3: "CRITICAL"}
try:
    import shap
except ImportError:
    shap = None


def transformed_feature_names(pipeline: object) -> list[str]:
    return list(pipeline.named_steps["preprocessor"].get_feature_names_out())


def source_feature(transformed_name: str) -> str:
    name = transformed_name.split("__", 1)[-1]
    for feature in FEATURES:
        if name == feature or name.startswith(f"{feature}_"):
            return feature
    for feature in FEATURES:
        if feature in name:
            return feature
    return name


def shap_values_for_prediction(pipeline: object, transformed: object, predicted_class: int, background: object | None = None) -> tuple[object, str]:
    classifier = pipeline.named_steps["classifier"]
    dense = transformed.toarray() if hasattr(transformed, "toarray") else transformed
    reference = background.toarray() if hasattr(background, "toarray") else background
    if reference is None:
        reference = dense
    explainer = shap.TreeExplainer(classifier) if classifier.__class__.__name__ in {"RandomForestClassifier", "XGBClassifier"} else shap.LinearExplainer(classifier, reference)
    values = explainer.shap_values(dense)
    values = np.asarray(values, dtype=float)
    if values.ndim == 3:
        values = values[:, :, predicted_class]
    if values.ndim == 2 and values.shape[0] == 1:
        values = values[0]
    return values.reshape(-1), "shap"


def fallback_values(pipeline: object, transformed: object, predicted_class: int) -> tuple[object, str]:
    classifier = pipeline.named_steps["classifier"]
    if hasattr(classifier, "coef_"):
        return transformed[0] * classifier.coef_[predicted_class], "linear_contributions_fallback"
    importances = getattr(classifier, "feature_importances_", None)
    if importances is not None:
        return importances, "global_feature_importance_fallback"
    raise RuntimeError("The saved classifier does not expose explainable feature values")


def explain(record: dict[str, object], model_path: Path = MODEL_PATH, limit: int = 5) -> dict[str, object]:
    missing = sorted(set(FEATURES) - set(record))
    if missing:
        raise ValueError(f"Missing explanation features: {missing}")
    pipeline = joblib.load(model_path)
    frame = pd.DataFrame([record], columns=FEATURES)
    transformed = pipeline.named_steps["preprocessor"].transform(frame)
    predicted_class = int(pipeline.predict(frame)[0])

    background_frame = pd.read_csv(DATA_PATH)[FEATURES].head(50)
    background_transformed = pipeline.named_steps["preprocessor"].transform(background_frame)
    if hasattr(transformed, "toarray"):
        transformed = transformed.toarray()
    if hasattr(background_transformed, "toarray"):
        background_transformed = background_transformed.toarray()

    if shap is not None:
        values, method = shap_values_for_prediction(pipeline, transformed, predicted_class, background_transformed)
    else:
        values, method = fallback_values(pipeline, transformed, predicted_class)
    names = transformed_feature_names(pipeline)
    values = np.asarray(values, dtype=float).reshape(-1)
    if len(values) != len(names):
        raise ValueError(f"SHAP value count {len(values)} does not match transformed feature count {len(names)}")
    grouped: dict[str, float] = {}
    for name, value in zip(names, values):
        feature = source_feature(name)
        grouped[feature] = grouped.get(feature, 0.0) + float(value)
    ranked = sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)
    contributor_entries = [
        {"feature": feature, "impact": round(value, 4), "direction": "increases_risk" if value > 0 else "decreases_risk"}
        for feature, value in ranked
        if value != 0
    ]
    positive = [{"feature": item["feature"], "impact": round(item["impact"], 4), "direction": "increases_risk"} for item in contributor_entries if item["impact"] > 0][:limit]
    negative = [{"feature": item["feature"], "impact": round(abs(item["impact"]), 4), "direction": "decreases_risk"} for item in contributor_entries if item["impact"] < 0][:limit]
    contributors = sorted(
        [
            {"feature": item["feature"], "impact": round(item["impact"], 4), "direction": item["direction"]}
            for item in contributor_entries
        ],
        key=lambda item: abs(item["impact"]),
        reverse=True,
    )
    probabilities = pipeline.predict_proba(frame)[0] if hasattr(pipeline, "predict_proba") else []
    risk_probability = float(probabilities[predicted_class]) if len(probabilities) else None
    risk_score = round(sum(index * float(probability) for index, probability in enumerate(probabilities)) * 100 / 3, 2) if len(probabilities) else None
    risk_level = LABELS[predicted_class]
    return {
        "risk_probability": round(risk_probability, 4) if risk_probability is not None else None,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "acquisition_risk": predicted_class,
        "top_positive_contributors": positive,
        "top_negative_contributors": negative,
        "contributors": contributors,
        "explanation_method": method,
        "synthetic_data_warning": "This explanation is based on a model trained on synthetic_demo data and is not for operational decisions.",
        "decision_support_notice": "AI supports review and does not autonomously approve or reject acquisition decisions.",
    }


def load_input_records(path: Path) -> tuple[str, list[dict[str, object]]]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON input must contain a single feature record object.")
        return "json", [payload]
    if suffix == ".csv":
        frame = pd.read_csv(path)
        if frame.empty:
            raise ValueError("CSV input contains no rows.")
        missing = sorted(set(FEATURES) - set(frame.columns))
        if missing:
            raise ValueError(f"CSV input is missing required features: {missing}")
        return "csv", frame.to_dict(orient="records")
    raise ValueError(f"Unsupported input file type: '{path.suffix or '<none>'}'. Please provide a .json or .csv file.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    try:
        input_type, records = load_input_records(args.input)
        if input_type == "json":
            result = explain(records[0], args.model, args.limit)
            print(json.dumps(result, indent=2))
            return

        limited_rows = records[: args.limit]
        explanations = [explain(record, args.model, args.limit) for record in limited_rows]
        print(json.dumps(explanations, indent=2))
    except (ValueError, TypeError, json.JSONDecodeError, pd.errors.EmptyDataError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
