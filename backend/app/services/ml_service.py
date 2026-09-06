"""Machine learning service layer for BhoomiSetu.

This service is intentionally minimal and reuses the existing trained sklearn pipeline
that was created by the ML prototype in ml/models/acquisition_risk_model.pkl.
The logic is kept deliberately simple so the API layer can stay thin and MVP-friendly.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

try:
    import shap
except ImportError:  # pragma: no cover - optional dependency guard
    shap = None

BASE_DIR = Path(__file__).resolve().parents[3]
MODEL_PATH = BASE_DIR / "ml" / "models" / "acquisition_risk_model.pkl"
DATA_PATH = BASE_DIR / "ml" / "data" / "land_acquisition_dataset.csv"

# Reuse the existing feature contract from the ML prototype.
FEATURES = [
    "state",
    "district",
    "land_type",
    "land_use",
    "project_type",
    "land_area",
    "number_of_owners",
    "ownership_complexity",
    "previous_dispute",
    "previous_objections",
    "land_value",
    "estimated_compensation",
    "environmental_risk",
    "road_accessibility",
    "distance_to_road",
    "stakeholder_count",
    "land_use_conflict",
    "documentation_completeness",
    "historical_acquisition_duration",
]

MODEL_VERSION = "acquisition-risk-0.1.0"
LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH", 3: "CRITICAL"}



@lru_cache(maxsize=1)
def get_model_pipeline() -> object:
    """Load the trained model once and cache it for the app lifetime."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model artifact not found at {MODEL_PATH}")

    model = joblib.load(MODEL_PATH)
    return model


def transformed_feature_names(pipeline: object) -> list[str]:
    return list(pipeline.named_steps["preprocessor"].get_feature_names_out())


def source_feature(transformed_name: str) -> str:
    """Map one-hot and scaled columns back to their original feature names."""
    name = transformed_name.split("__", 1)[-1]
    for feature in FEATURES:
        if name == feature or name.startswith(f"{feature}_"):
            return feature
    for feature in FEATURES:
        if feature in name:
            return feature
    return name


def shap_values_for_prediction(pipeline: object, transformed: object, predicted_class: int, background: object | None = None) -> tuple[np.ndarray, str]:
    """Extract SHAP values for the selected class using a real background dataset.

    This follows the same design as the ML prototype, but keeps the logic in the API layer
    rather than in the training scripts. The key point is to avoid using a single point as
    its own background for LinearExplainer, which can otherwise collapse values to zero.
    """
    classifier = pipeline.named_steps["classifier"]
    dense = transformed.toarray() if hasattr(transformed, "toarray") else transformed
    reference = background.toarray() if hasattr(background, "toarray") else background
    if reference is None:
        reference = dense

    if classifier.__class__.__name__ in {"RandomForestClassifier", "XGBClassifier"}:
        explainer = shap.TreeExplainer(classifier)
    else:
        explainer = shap.LinearExplainer(classifier, reference)

    values = explainer.shap_values(dense)
    values = np.asarray(values, dtype=float)
    if values.ndim == 3:
        values = values[:, :, predicted_class]
    if values.ndim == 2 and values.shape[0] == 1:
        values = values[0]

    return values.reshape(-1), "shap"


def fallback_values(pipeline: object, transformed: object, predicted_class: int) -> tuple[np.ndarray, str]:
    """Fallback for environments without SHAP, keeping the same output structure."""
    classifier = pipeline.named_steps["classifier"]
    if hasattr(classifier, "coef_"):
        return transformed[0] * classifier.coef_[predicted_class], "linear_contributions_fallback"
    importances = getattr(classifier, "feature_importances_", None)
    if importances is not None:
        return importances, "global_feature_importance_fallback"
    raise RuntimeError("The saved classifier does not expose explainable feature values")


def build_record(payload: dict[str, object]) -> dict[str, object]:
    """Normalize a request payload into the ML feature contract."""
    missing = sorted(set(FEATURES) - set(payload))
    if missing:
        raise ValueError(f"Missing required feature fields: {missing}")
    return {feature: payload[feature] for feature in FEATURES}


def predict_single_record(record: dict[str, object]) -> dict[str, object]:
    """Run the saved sklearn pipeline and return probability + risk metadata."""
    pipeline = get_model_pipeline()
    frame = pd.DataFrame([record], columns=FEATURES)
    probabilities = pipeline.predict_proba(frame)[0]
    predicted_class = int(pipeline.predict(frame)[0])
    risk_probability = float(probabilities[predicted_class])
    risk_score = round(sum(index * float(probability) for index, probability in enumerate(probabilities)) * 100 / 3, 2)
    return {
        "risk_probability": round(risk_probability, 4),
        "risk_score": risk_score,
        "risk_level": LABELS[predicted_class],
        "acquisition_risk": predicted_class,
    }


def explain_single_record(record: dict[str, object], limit: int = 5) -> dict[str, object]:
    """Generate the same SHAP-backed explanation contract used by the prototype."""
    pipeline = get_model_pipeline()
    frame = pd.DataFrame([record], columns=FEATURES)
    transformed = pipeline.named_steps["preprocessor"].transform(frame)
    predicted_class = int(pipeline.predict(frame)[0])

    # Use a small background sample from the real dataset so SHAP values are meaningful.
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
        {
            "feature": feature,
            "impact": round(value, 4),
            "direction": "increases_risk" if value > 0 else "decreases_risk",
        }
        for feature, value in ranked
        if value != 0
    ]

    positive = [
        {"feature": item["feature"], "impact": round(item["impact"], 4), "direction": "increases_risk"}
        for item in contributor_entries
        if item["impact"] > 0
    ][:limit]
    negative = [
        {"feature": item["feature"], "impact": round(abs(item["impact"]), 4), "direction": "decreases_risk"}
        for item in contributor_entries
        if item["impact"] < 0
    ][:limit]
    contributors = sorted(
        [
            {"feature": item["feature"], "impact": round(item["impact"], 4), "direction": item["direction"]}
            for item in contributor_entries
        ],
        key=lambda item: abs(item["impact"]),
        reverse=True,
    )

    prediction = predict_single_record(record)
    result = {
        "risk_probability": prediction["risk_probability"],
        "risk_score": prediction["risk_score"],
        "risk_level": prediction["risk_level"],
        "acquisition_risk": prediction["acquisition_risk"],
        "top_positive_contributors": positive,
        "top_negative_contributors": negative,
        "contributors": contributors,
        "explanation_method": method,
        "synthetic_data_warning": "This explanation is based on a model trained on synthetic_demo data and is not for operational decisions.",
        "decision_support_notice": "AI supports review and does not autonomously approve or reject acquisition decisions.",
    }
    return result
