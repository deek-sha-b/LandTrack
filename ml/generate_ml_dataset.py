#!/usr/bin/env python3
"""
LandTrack - Synthetic Machine Learning Dataset Generator
=========================================================

Step 1: Synthetic ML Dataset Generation
Generates reproducible synthetic training data for parcel acquisition priority prediction.

Columns (exactly 6):
  1. Parcel_ID: Unique identifier (e.g., PARCEL_00001)
  2. Total_Area_m2: Positive total parcel area in square meters
  3. Affected_Area_m2: Positive affected area within corridor (<= Total_Area_m2)
  4. Affected_Percentage: Percentage affected = (Affected_Area_m2 / Total_Area_m2) * 100 (0 - 100)
  5. Impact_Type: 'Full' if Affected_Percentage >= 90.0, else 'Partial'
  6. Priority: Acquisition priority class ('Low', 'Medium', 'High')

Scoring Rule for Priority (Documented Academic Heuristic):
--------------------------------------------------------
Priority reflects the acquisition urgency, compensation magnitude, and severity
of parcel impact in highway corridor planning. The priority score S in [0, 1] is:

  S = 0.55 * Norm_Pct + 0.40 * Norm_Area + Noise

Where:
  - Norm_Pct = Affected_Percentage / 100.0  (Severity of physical parcel takeover)
  - Norm_Area = min(Affected_Area_m2 / 5000.0, 1.0) (Physical scale / compensation benchmark)
  - Noise ~ N(0, 0.04) (Realistic unobserved variation, e.g., land use or structure proximity)
  - Score is clamped to [0.0, 1.0]

Thresholds:
  - S >= 0.55             -> High Priority (Major disruption, high compensation / severe slice)
  - 0.25 <= S < 0.55      -> Medium Priority (Moderate corridor clipping or mid-sized acquisition)
  - S < 0.25              -> Low Priority (Minor perimeter strip, low impact, easily compensated)

Output:
  Saved to data/LandTrack_Synthetic_ML_Dataset.csv
"""

import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd


# Configuration
RANDOM_SEED = 42
NUM_RECORDS = 5000
EXPECTED_COLUMNS = [
    "Parcel_ID",
    "Total_Area_m2",
    "Affected_Area_m2",
    "Affected_Percentage",
    "Impact_Type",
    "Priority",
]


def get_paths():
    """Resolve project root and data paths safely."""
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    data_dir = project_root / "data"
    output_file = data_dir / "LandTrack_Synthetic_ML_Dataset.csv"
    return project_root, data_dir, output_file


def generate_dataset(num_records: int = NUM_RECORDS, seed: int = RANDOM_SEED) -> pd.DataFrame:
    """
    Generate synthetic parcel records following realistic distributions and scoring rules.
    """
    np.random.seed(seed)

    # 1. Generate realistic positive total parcel areas (m2)
    # Mixture distribution reflecting typical Indian rural and semi-urban parcel sizes:
    # 25% small residential / homestead plots: 250 - 1,200 m2
    # 50% medium agricultural / plantation parcels: 1,200 - 6,000 m2
    # 25% larger agricultural estates: 6,000 - 25,000 m2
    n_small = int(num_records * 0.25)
    n_med = int(num_records * 0.50)
    n_large = num_records - n_small - n_med

    total_areas = np.concatenate([
        np.random.uniform(250.0, 1200.0, n_small),
        np.random.uniform(1200.0, 6000.0, n_med),
        np.random.uniform(6000.0, 25000.0, n_large)
    ])
    np.random.shuffle(total_areas)
    total_areas = np.round(total_areas, 2)

    # 2. Generate affected percentage distribution representing realistic corridor overlap:
    # 35% minor corridor edge clipping (1.0% - 25.0%)
    # 40% moderate throughway intersection (25.0% - 70.0%)
    # 15% severe bisecting / heavy takeover (70.0% - 90.0%)
    # 10% near-total or total corridor coverage (90.0% - 100.0%)
    n_clip = int(num_records * 0.35)
    n_mod = int(num_records * 0.40)
    n_sev = int(num_records * 0.15)
    n_full = num_records - n_clip - n_mod - n_sev

    pct_samples = np.concatenate([
        np.random.uniform(1.0, 25.0, n_clip),
        np.random.uniform(25.0, 70.0, n_mod),
        np.random.uniform(70.0, 90.0, n_sev),
        np.random.uniform(90.0, 100.0, n_full)
    ])
    np.random.shuffle(pct_samples)

    # 3. Calculate Affected_Area_m2 and guarantee Affected_Area_m2 <= Total_Area_m2 and > 0
    raw_affected = total_areas * (pct_samples / 100.0)
    affected_areas = np.round(raw_affected, 2)
    # Strict clamping: never exceed Total_Area_m2 and minimum 0.01 m2
    affected_areas = np.clip(affected_areas, 0.01, total_areas)

    # 4. Recompute exact Affected_Percentage from the rounded area fields
    affected_percentages = np.round((affected_areas / total_areas) * 100.0, 2)
    # Strict clip between 0.0 and 100.0
    affected_percentages = np.clip(affected_percentages, 0.0, 100.0)

    # 5. Determine synthetic Impact_Type:
    # Set to 'Full' when Affected_Percentage >= 90.0; otherwise 'Partial'
    impact_types = np.where(affected_percentages >= 90.0, "Full", "Partial")

    # 6. Priority Scoring Rule (Documented Academic Heuristic)
    # Composite score combining relative impact and absolute affected area with modest variation
    norm_pct = affected_percentages / 100.0
    norm_area = np.clip(affected_areas / 5000.0, 0.0, 1.0)
    noise = np.random.normal(loc=0.0, scale=0.04, size=num_records)

    scores = 0.55 * norm_pct + 0.40 * norm_area + noise
    scores = np.clip(scores, 0.0, 1.0)

    priorities = np.where(scores >= 0.55, "High", np.where(scores >= 0.25, "Medium", "Low"))

    # 7. Construct Parcel IDs (e.g., PARCEL_00001)
    parcel_ids = [f"PARCEL_{i+1:05d}" for i in range(num_records)]

    # 8. Assemble DataFrame
    df = pd.DataFrame({
        "Parcel_ID": parcel_ids,
        "Total_Area_m2": total_areas,
        "Affected_Area_m2": affected_areas,
        "Affected_Percentage": affected_percentages,
        "Impact_Type": impact_types,
        "Priority": priorities,
    })

    return df


def validate_dataset(df: pd.DataFrame) -> dict:
    """
    Perform comprehensive validation checks on the dataset.
    Raises ValueError if any check fails.
    """
    errors = []

    # 1. Row count check
    if len(df) != NUM_RECORDS:
        errors.append(f"Row count mismatch: expected {NUM_RECORDS}, got {len(df)}")

    # 2. Column names and order
    if list(df.columns) != EXPECTED_COLUMNS:
        errors.append(f"Columns mismatch: expected {EXPECTED_COLUMNS}, got {list(df.columns)}")

    # 3. Missing / NaN / Null values
    null_counts = df.isnull().sum()
    if null_counts.any():
        errors.append(f"Missing values detected: {null_counts[null_counts > 0].to_dict()}")

    # 4. Valid ranges: Total_Area_m2 > 0
    if not (df["Total_Area_m2"] > 0).all():
        invalid = (df["Total_Area_m2"] <= 0).sum()
        errors.append(f"Found {invalid} rows with non-positive Total_Area_m2")

    # 5. Valid ranges: Affected_Area_m2 > 0
    if not (df["Affected_Area_m2"] > 0).all():
        invalid = (df["Affected_Area_m2"] <= 0).sum()
        errors.append(f"Found {invalid} rows with non-positive Affected_Area_m2")

    # 6. Affected_Area_m2 <= Total_Area_m2
    exceeding = (df["Affected_Area_m2"] > df["Total_Area_m2"]).sum()
    if exceeding > 0:
        errors.append(f"Found {exceeding} rows where Affected_Area_m2 > Total_Area_m2")

    # 7. Affected_Percentage between 0 and 100
    invalid_pct = ((df["Affected_Percentage"] < 0) | (df["Affected_Percentage"] > 100)).sum()
    if invalid_pct > 0:
        errors.append(f"Found {invalid_pct} rows with Affected_Percentage out of [0, 100]")

    # 8. Impact_Type rule consistency: 'Full' if Affected_Percentage >= 90 else 'Partial'
    expected_impact = np.where(df["Affected_Percentage"] >= 90.0, "Full", "Partial")
    mismatched_impact = (df["Impact_Type"].values != expected_impact).sum()
    if mismatched_impact > 0:
        errors.append(f"Found {mismatched_impact} rows with inconsistent Impact_Type")

    # 9. Priority classes check: All three present and valid
    valid_priorities = {"Low", "Medium", "High"}
    actual_priorities = set(df["Priority"].unique())
    if not actual_priorities.issubset(valid_priorities):
        errors.append(f"Unexpected priority values: {actual_priorities - valid_priorities}")
    if actual_priorities != valid_priorities:
        errors.append(f"Missing priority classes. Expected {valid_priorities}, got {actual_priorities}")

    if errors:
        raise ValueError("Validation failed:\n" + "\n".join(f" - {e}" for e in errors))

    # Priority distribution summary
    priority_counts = df["Priority"].value_counts().to_dict()
    impact_counts = df["Impact_Type"].value_counts().to_dict()

    return {
        "status": "PASSED",
        "row_count": len(df),
        "columns": list(df.columns),
        "priority_distribution": priority_counts,
        "impact_distribution": impact_counts,
        "total_area_summary": {
            "min": float(df["Total_Area_m2"].min()),
            "max": float(df["Total_Area_m2"].max()),
            "mean": round(float(df["Total_Area_m2"].mean()), 2),
        },
        "affected_area_summary": {
            "min": float(df["Affected_Area_m2"].min()),
            "max": float(df["Affected_Area_m2"].max()),
            "mean": round(float(df["Affected_Area_m2"].mean()), 2),
        },
        "affected_pct_summary": {
            "min": float(df["Affected_Percentage"].min()),
            "max": float(df["Affected_Percentage"].max()),
            "mean": round(float(df["Affected_Percentage"].mean()), 2),
        },
    }


def main():
    print("=" * 70)
    print("LandTrack - Step 1: Synthetic ML Dataset Generator")
    print("=" * 70)

    project_root, data_dir, output_file = get_paths()

    # Ensure output directories exist
    data_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] Generating {NUM_RECORDS} synthetic records (seed={RANDOM_SEED})...")
    df = generate_dataset(num_records=NUM_RECORDS, seed=RANDOM_SEED)

    print("[2/4] Running rigorous validation checks...")
    results = validate_dataset(df)

    print(f"[3/4] Saving dataset to: {output_file.resolve()}...")
    df.to_csv(output_file, index=False)

    # Verify file was written and verify re-read
    if not output_file.exists():
        raise FileNotFoundError(f"Output CSV was not found at {output_file}")
    
    file_size_bytes = output_file.stat().st_size
    re_read_df = pd.read_csv(output_file)
    validate_dataset(re_read_df)

    print("[4/4] Validation and verification complete!\n")
    print("SUCCESS: Synthetic ML dataset created and validated successfully!")
    print(f"Output file: {output_file.resolve()}")
    print(f"File size:   {file_size_bytes:,} bytes")
    print(f"Total rows:  {len(re_read_df):,}")
    print("\nPriority Class Distribution:")
    for cls in ["Low", "Medium", "High"]:
        cnt = results["priority_distribution"].get(cls, 0)
        pct = (cnt / NUM_RECORDS) * 100.0
        print(f"  - {cls:<8}: {cnt:>5} records ({pct:5.1f}%)")

    print("\nImpact Type Distribution:")
    for imp in ["Partial", "Full"]:
        cnt = results["impact_distribution"].get(imp, 0)
        pct = (cnt / NUM_RECORDS) * 100.0
        print(f"  - {imp:<8}: {cnt:>5} records ({pct:5.1f}%)")

    print(f"\nArea Ranges (m2):")
    print(f"  - Total Area:    [{results['total_area_summary']['min']:.2f}, {results['total_area_summary']['max']:.2f}] (mean: {results['total_area_summary']['mean']:.2f})")
    print(f"  - Affected Area: [{results['affected_area_summary']['min']:.2f}, {results['affected_area_summary']['max']:.2f}] (mean: {results['affected_area_summary']['mean']:.2f})")
    print(f"  - Affected %:    [{results['affected_pct_summary']['min']:.2f}%, {results['affected_pct_summary']['max']:.2f}%] (mean: {results['affected_pct_summary']['mean']:.2f}%)")
    print("=" * 70)


if __name__ == "__main__":
    main()
