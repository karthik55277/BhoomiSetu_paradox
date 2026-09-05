"""Shared preprocessing and dataset definitions for the risk model."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

TARGET = "acquisition_risk"
DATA_PATH = Path("ml/data/land_acquisition_dataset.csv")
MODEL_PATH = Path("ml/models/acquisition_risk_model.pkl")
PREPROCESSOR_PATH = Path("ml/models/acquisition_risk_preprocessor.pkl")
RANDOM_STATE = 26016
CATEGORICAL_FEATURES = ["state", "district", "land_type", "land_use", "project_type"]
NUMERICAL_FEATURES = [
    "land_area", "number_of_owners", "ownership_complexity", "previous_dispute",
    "previous_objections", "land_value", "estimated_compensation", "environmental_risk",
    "road_accessibility", "distance_to_road", "stakeholder_count", "land_use_conflict",
    "documentation_completeness", "historical_acquisition_duration",
]
FEATURES = CATEGORICAL_FEATURES + NUMERICAL_FEATURES
LEAKAGE_OR_ID_COLUMNS = {"parcel_id", "acquisition_duration"}


def load_dataset(path: Path = DATA_PATH) -> pd.DataFrame:
    data = pd.read_csv(path)
    required = set(FEATURES + [TARGET])
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")
    if data.empty:
        raise ValueError("Dataset is empty")
    if not set(data[TARGET].dropna().unique()).issubset({0, 1, 2, 3}):
        raise ValueError("acquisition_risk must contain only 0, 1, 2, or 3")
    return data


def split_features_target(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    return data[FEATURES].copy(), data[TARGET].astype(int).copy()


def build_preprocessor() -> ColumnTransformer:
    numeric = Pipeline([
        ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ("scaler", StandardScaler()),
    ])
    categorical = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent", add_indicator=True)),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("numeric", numeric, NUMERICAL_FEATURES),
        ("categorical", categorical, CATEGORICAL_FEATURES),
    ])
