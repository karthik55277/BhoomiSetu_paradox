"""Generate the reproducible BhoomiSetu demo training dataset.

The records are synthetic and must be replaced or supplemented with verified
historical records before a production model is trained.
"""
from csv import DictWriter
from pathlib import Path
from random import Random

SEED = 26016
RECORD_COUNT = 240
OUTPUT = Path(__file__).with_name("land_acquisition_risk.csv")

DISTRICTS = ["Patna", "Vaishali", "Gaya", "Muzaffarpur", "Nalanda", "Bhagalpur", "Bhojpur", "Saran"]
LAND_TYPES = ["Agricultural", "Residential", "Commercial", "Industrial", "Forest buffer"]
LAND_USES = ["Single-crop", "Multi-crop", "Fallow", "Residential", "Commercial", "Mixed use"]
PROJECT_TYPES = ["Road", "Rail", "Water management", "Industrial corridor", "Public utility"]
STATES = ["Bihar"]
FIELDNAMES = [
    "record_id", "state", "district", "project_type", "land_area_ha",
    "number_of_owners", "ownership_complexity", "previous_dispute",
    "previous_objections", "land_type", "land_value_cr", "environmental_risk",
    "road_accessibility", "distance_to_road_km", "stakeholder_count",
    "compensation_exposure_cr", "land_use_conflict", "documentation_completeness",
    "acquisition_risk", "risk_score", "source_label",
]


def bounded(value: float, low: int = 0, high: int = 10) -> int:
    return max(low, min(high, round(value)))


def risk_class(score: int) -> int:
    if score <= 30:
        return 0
    if score <= 60:
        return 1
    if score <= 80:
        return 2
    return 3


def make_record(index: int, rng: Random) -> dict[str, object]:
    land_area = round(rng.uniform(1.2, 14.0), 2)
    owners = rng.randint(1, 7)
    complexity = bounded(owners * 1.15 + rng.uniform(-1.4, 2.0))
    dispute = int(rng.random() < 0.26)
    objections = rng.randint(0, 4) if dispute else rng.choice([0, 0, 1])
    land_type = rng.choice(LAND_TYPES)
    land_use = rng.choice(LAND_USES)
    project_type = rng.choice(PROJECT_TYPES)
    environmental = bounded(rng.uniform(0, 8) + (2 if land_type == "Forest buffer" else 0))
    accessibility = bounded(rng.uniform(3, 10) - (2 if land_type == "Forest buffer" else 0))
    road_distance = round(rng.uniform(0.2, 8.0), 2)
    stakeholders = rng.randint(2, 14)
    documentation = bounded(rng.uniform(5, 10) - (1.5 if owners > 4 else 0))
    land_value = round(land_area * rng.uniform(0.25, 0.62), 2)
    conflict = bounded(rng.uniform(0, 5) + (3 if land_use == "Residential" and project_type == "Road" else 0))
    compensation = round(land_value * rng.uniform(0.92, 1.35), 2)

    # Synthetic label formula: transparent and deterministic for benchmarking.
    raw_score = (
        complexity * 3.2 + dispute * 15 + objections * 5 + environmental * 2.6
        + (10 - accessibility) * 2.1 + road_distance * 1.4 + stakeholders * 0.9
        + conflict * 2.8 + (10 - documentation) * 3.4 + rng.uniform(-7, 7)
    )
    # Stratify synthetic records evenly across the four target bands while
    # retaining feature-driven variation inside each band.
    target_band = (index - 1) % 4
    band_ranges = [(0, 30), (31, 60), (61, 80), (81, 100)]
    band_low, band_high = band_ranges[target_band]
    band_midpoint = (band_low + band_high) / 2
    score = max(band_low, min(band_high, round((raw_score + band_midpoint) / 2)))
    return {
        "record_id": f"SYN-{index:04d}",
        "state": rng.choice(STATES),
        "district": rng.choice(DISTRICTS),
        "project_type": project_type,
        "land_area_ha": f"{land_area:.2f}",
        "number_of_owners": owners,
        "ownership_complexity": complexity,
        "previous_dispute": dispute,
        "previous_objections": objections,
        "land_type": land_type,
        "land_value_cr": f"{land_value:.2f}",
        "environmental_risk": environmental,
        "road_accessibility": accessibility,
        "distance_to_road_km": f"{road_distance:.2f}",
        "stakeholder_count": stakeholders,
        "compensation_exposure_cr": f"{compensation:.2f}",
        "land_use_conflict": conflict,
        "documentation_completeness": documentation,
        "acquisition_risk": risk_class(score),
        "risk_score": score,
        "source_label": "synthetic_demo",
    }


def main() -> None:
    rng = Random(SEED)
    rows = [make_record(index, rng) for index in range(1, RECORD_COUNT + 1)]
    with OUTPUT.open("w", newline="", encoding="utf-8") as file:
        writer = DictWriter(file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    counts = {risk: sum(row["acquisition_risk"] == risk for row in rows) for risk in range(4)}
    print(f"Wrote {len(rows)} records to {OUTPUT}")
    print("Class distribution:", counts)


if __name__ == "__main__":
    main()
