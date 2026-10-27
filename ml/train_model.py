#!/usr/bin/env python3
"""
LandTrack - Parcel Acquisition Priority Model Training
======================================================

Step 2: Train a Random Forest Classifier to predict parcel acquisition priority
(Low, Medium, High) based on corridor intersection metrics:
  - Affected_Area_m2
  - Affected_Percentage
  - Impact_Type

Outputs:
  - Model pipeline: ml/landtrack_priority_model.pkl
  - Evaluation report: ml/model_evaluation.txt

Safety & Constraints:
  - Does NOT use Parcel_ID as a feature.
  - Does NOT include Land_Type.
  - Does NOT modify existing GIS calculations, cadastral layers, or web UI.
"""

import os
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# Configuration
RANDOM_SEED = 42
TEST_SIZE = 0.20
EXPECTED_ROWS = 5000
EXPECTED_COLUMNS = [
    "Parcel_ID",
    "Total_Area_m2",
    "Affected_Area_m2",
    "Affected_Percentage",
    "Impact_Type",
    "Priority",
]
FEATURE_COLUMNS = ["Affected_Area_m2", "Affected_Percentage", "Impact_Type"]
TARGET_COLUMN = "Priority"
VALID_CLASSES = ["High", "Low", "Medium"]


def get_paths():
    """Resolve file paths relative to project root."""
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    dataset_path = project_root / "datasets" / "ml" / "LandTrack_ML_Dataset.csv"
    model_path = script_dir / "landtrack_priority_model.pkl"
    eval_report_path = script_dir / "model_evaluation.txt"
    return project_root, dataset_path, model_path, eval_report_path


def load_and_validate_dataset(csv_path: Path) -> pd.DataFrame:
    """
    Load dataset and execute strict verification checks.
    """
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at expected path: {csv_path.resolve()}\n"
            "Please ensure datasets/ml/LandTrack_ML_Dataset.csv exists."
        )

    df = pd.read_csv(csv_path)

    # 1. Row count validation
    if len(df) != EXPECTED_ROWS:
        raise ValueError(
            f"Row count validation failed: expected {EXPECTED_ROWS} records, but found {len(df)}."
        )

    # 2. Column schema check
    missing_cols = set(EXPECTED_COLUMNS) - set(df.columns)
    if missing_cols:
        raise ValueError(f"Dataset missing required columns: {missing_cols}")

    # 3. Missing values check
    null_counts = df[EXPECTED_COLUMNS].isnull().sum()
    if null_counts.any():
        raise ValueError(
            f"Dataset contains null values in required columns: {null_counts[null_counts > 0].to_dict()}"
        )

    # 4. Target class validation
    classes_present = sorted(df[TARGET_COLUMN].unique())
    if set(classes_present) != set(VALID_CLASSES):
        raise ValueError(
            f"Target column '{TARGET_COLUMN}' must contain classes {VALID_CLASSES}, but found {classes_present}."
        )

    # 5. Features validation
    if not (df["Affected_Area_m2"] > 0).all():
        raise ValueError("Invalid Affected_Area_m2 values: must be strictly positive.")
    if not ((df["Affected_Percentage"] >= 0) & (df["Affected_Percentage"] <= 100)).all():
        raise ValueError("Invalid Affected_Percentage values: must be within [0, 100].")

    return df


def build_pipeline() -> Pipeline:
    """
    Build a complete preprocessing and RandomForestClassifier pipeline.
    One-hot encodes Impact_Type while passing numerical features through.
    """
    categorical_features = ["Impact_Type"]
    numeric_features = ["Affected_Area_m2", "Affected_Percentage"]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                categorical_features,
            ),
            ("num", "passthrough", numeric_features),
        ],
        remainder="drop",
    )

    classifier = RandomForestClassifier(
        n_estimators=100,
        random_state=RANDOM_SEED,
        n_jobs=-1,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )

    return pipeline


def main():
    print("=" * 75)
    print("LandTrack - Parcel Acquisition Priority Model Training")
    print("=" * 75)

    project_root, dataset_path, model_path, eval_report_path = get_paths()
    model_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\n[1/6] Loading and validating dataset from:\n      {dataset_path.resolve()}")
    df = load_and_validate_dataset(dataset_path)
    print(f"      [PASSED] Successfully validated {len(df):,} records with 0 missing values.")

    # Prepare features and target
    X = df[FEATURE_COLUMNS].copy()
    y = df[TARGET_COLUMN].copy()

    # Split dataset (80% train, 20% test with stratification)
    print(f"\n[2/6] Splitting data into 80% train and 20% test (stratified, seed={RANDOM_SEED})...")
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=y,
    )

    print(f"      - Training rows: {len(X_train):,} ({len(X_train)/len(df)*100:.1f}%)")
    print(f"      - Testing rows:  {len(X_test):,} ({len(X_test)/len(df)*100:.1f}%)")
    print("      - Train class distribution:")
    for cls, cnt in y_train.value_counts().items():
        print(f"          * {cls:<8}: {cnt:>4} ({cnt/len(y_train)*100:5.1f}%)")
    print("      - Test class distribution:")
    for cls, cnt in y_test.value_counts().items():
        print(f"          * {cls:<8}: {cnt:>4} ({cnt/len(y_test)*100:5.1f}%)")

    # Build and train pipeline
    print("\n[3/6] Building preprocessing pipeline & training RandomForestClassifier...")
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    print("      [PASSED] Pipeline fit completed successfully.")

    # Predict on test set
    print("\n[4/6] Evaluating on held-out test set...")
    y_pred = pipeline.predict(X_test)

    # Compute metrics
    acc = accuracy_score(y_test, y_pred)
    prec_macro = precision_score(y_test, y_pred, average="macro")
    prec_weighted = precision_score(y_test, y_pred, average="weighted")
    rec_macro = recall_score(y_test, y_pred, average="macro")
    rec_weighted = recall_score(y_test, y_pred, average="weighted")
    f1_mac = f1_score(y_test, y_pred, average="macro")
    f1_weight = f1_score(y_test, y_pred, average="weighted")

    cls_labels = sorted(list(y_test.unique()))
    cm = confusion_matrix(y_test, y_pred, labels=cls_labels)
    clf_report = classification_report(y_test, y_pred, labels=cls_labels, digits=4)

    print(f"      - Accuracy:          {acc:.4f} ({acc*100:.2f}%)")
    print(f"      - Macro Precision:   {prec_macro:.4f}")
    print(f"      - Weighted Precision:{prec_weighted:.4f}")
    print(f"      - Macro Recall:      {rec_macro:.4f}")
    print(f"      - Weighted Recall:   {rec_weighted:.4f}")
    print(f"      - Macro F1-Score:    {f1_mac:.4f}")
    print(f"      - Weighted F1-Score: {f1_weight:.4f}")

    print("\nConfusion Matrix (Labels: High, Low, Medium):")
    print(f"                Pred_High  Pred_Low  Pred_Med")
    for idx, true_lbl in enumerate(cls_labels):
        row_str = " ".join(f"{cm[idx][j]:>9}" for j in range(len(cls_labels)))
        print(f"  True_{true_lbl:<6}: {row_str}")

    print("\nClassification Report:")
    print(clf_report)

    # Save model pipeline
    print(f"\n[5/6] Saving complete pipeline to:\n      {model_path.resolve()}...")
    joblib.dump(pipeline, model_path)
    if not model_path.exists():
        raise FileNotFoundError(f"Failed to verify model file at {model_path}")
    print(f"      [SAVED] Model file size: {model_path.stat().st_size:,} bytes")

    # Save evaluation report with synthetic data limitation notice
    print(f"\n[6/6] Writing evaluation report to:\n      {eval_report_path.resolve()}...")
    report_content = f"""================================================================================
LandTrack - Parcel Acquisition Priority Model Evaluation Report
================================================================================
Model Architecture:
  - Pipeline: scikit-learn Pipeline
  - Preprocessor: ColumnTransformer
      * Categorical: OneHotEncoder(handle_unknown='ignore', sparse_output=False) on ['Impact_Type']
      * Numerical: Passthrough on ['Affected_Area_m2', 'Affected_Percentage']
  - Classifier: RandomForestClassifier(n_estimators=100, random_state={RANDOM_SEED})

Features Used (3):
  1. Affected_Area_m2 (float)
  2. Affected_Percentage (float, 0-100)
  3. Impact_Type (category: Full / Partial)

Excluded Columns:
  - Parcel_ID (identifier only)
  - Total_Area_m2 (implicit in percentage; not in model feature set)
  - Land_Type (strictly excluded)

Dataset Summary:
  - Source: datasets/ml/LandTrack_ML_Dataset.csv
  - Total Valid Records: {len(df):,}
  - Training Set (80%):  {len(X_train):,} records
  - Test Set (20%):      {len(X_test):,} records
  - Split Random State:  {RANDOM_SEED} (stratified)

Training Set Class Distribution:
{pd.Series(y_train).value_counts().to_string()}

Test Set Class Distribution:
{pd.Series(y_test).value_counts().to_string()}

================================================================================
Evaluation Metrics (Held-Out Test Set: n=1,000)
================================================================================
Accuracy:           {acc:.4f} ({acc*100:.2f}%)
Macro Precision:    {prec_macro:.4f}
Weighted Precision: {prec_weighted:.4f}
Macro Recall:       {rec_macro:.4f}
Weighted Recall:    {rec_weighted:.4f}
Macro F1-Score:     {f1_mac:.4f}
Weighted F1-Score:  {f1_weight:.4f}

Classification Report:
{clf_report}

Confusion Matrix (Labels: {cls_labels}):
{cm}

Saved Model Artifact:
  - Path: ml/landtrack_priority_model.pkl
  - Size: {model_path.stat().st_size:,} bytes

================================================================================
Synthetic-Data Limitation Notice (Academic & Demonstration Notice)
================================================================================
NOTICE:
The priority classifications ('Low', 'Medium', 'High') and training records in
this model are derived from synthetic training data created for academic research,
algorithm development, and software demonstration purposes.

1. Not Official Determinations:
   The predicted acquisition priorities do NOT represent official government
   acquisition orders, statutory Gazette notifications, legal awards, or actual
   Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation
   and Resettlement Act (RFCTLARR) decisions.

2. Deterministic Heuristic Approximation:
   The underlying labels reflect a synthetic composite heuristic based primarily
   on corridor overlap percentage and affected physical area with stochastic
   variation. Real-world land acquisition involves multidimensional statutory,
   environmental, socio-economic, structural valuation, and title verification factors
   not captured in this synthetic feature set.

3. Demonstration Scope:
   This model artifact is intended strictly to validate the automated Machine Learning
   inference pipeline within the LandTrack application stack.
================================================================================
"""
    with open(eval_report_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    if not eval_report_path.exists():
        raise FileNotFoundError(f"Failed to verify evaluation file at {eval_report_path}")
    print(f"      [SAVED] Evaluation report size: {eval_report_path.stat().st_size:,} bytes")

    print("\n" + "=" * 75)
    print("SUCCESS: Model training, evaluation, and artifact generation complete!")
    print(f"Model Artifact:    {model_path.resolve()}")
    print(f"Evaluation Report: {eval_report_path.resolve()}")
    print("=" * 75)


if __name__ == "__main__":
    main()
