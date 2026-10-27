"""
LandTrack - Machine Learning Priority Prediction Service
=========================================================

Handles loading the scikit-learn Random Forest model pipeline once at startup
and applying it to GIS-calculated affected parcels.

Features used by model:
  - Affected_Area_m2 (float)
  - Affected_Percentage (float, 0-100)
  - Impact_Type ('Full' or 'Partial')

Target:
  - Priority ('Low', 'Medium', 'High')
"""

import os
import logging
from pathlib import Path
import joblib
import pandas as pd
from config import Config

logger = logging.getLogger(__name__)

# Singleton model container
_PRIORITY_MODEL = None
_MODEL_PATH_LOADED = None


def get_model_path() -> Path:
    """Find the trained model pipeline file in project directories."""
    candidates = [
        Path(Config.BASE_DIR) / "ml" / "landtrack_priority_model.pkl",
        Path(Config.BASE_DIR) / "models" / "landtrack_priority_model.pkl",
    ]
    for p in candidates:
        if p.exists():
            return p
    # Default to expected ml/ directory path
    return candidates[0]


def load_priority_model(force_reload: bool = False):
    """
    Load the saved model pipeline using joblib once when the backend starts.
    Subsequent calls return the cached in-memory pipeline.
    """
    global _PRIORITY_MODEL, _MODEL_PATH_LOADED

    if _PRIORITY_MODEL is not None and not force_reload:
        return _PRIORITY_MODEL

    model_path = get_model_path()
    if not model_path.exists():
        logger.warning(
            f"Priority model file not found at: {model_path}. "
            "Please ensure ml/train_model.py has been run."
        )
        return None

    try:
        logger.info(f"Loading LandTrack ML Priority model from: {model_path}")
        _PRIORITY_MODEL = joblib.load(model_path)
        _MODEL_PATH_LOADED = str(model_path)
        print(f"[ML SERVICE] Successfully loaded Priority model pipeline from: {model_path}")
        return _PRIORITY_MODEL
    except Exception as e:
        logger.error(f"Failed to load priority model from {model_path}: {e}")
        return None


def is_model_ready() -> bool:
    """Check if the ML priority model is loaded and ready for inference."""
    return _PRIORITY_MODEL is not None


def get_model_info() -> dict:
    """Return model runtime status and metadata."""
    return {
        "ready": is_model_ready(),
        "model_path": _MODEL_PATH_LOADED,
        "features": ["Affected_Area_m2", "Affected_Percentage", "Impact_Type"],
        "target": "Priority",
        "classes": ["High", "Low", "Medium"] if is_model_ready() else [],
    }


def predict_priority_single(affected_area: float, affected_percentage: float, impact_type: str) -> str:
    """
    Predict acquisition priority for a single parcel using actual GIS metrics.
    """
    model = load_priority_model()
    # Normalize impact type to 'Full' or 'Partial' expected by model encoder
    norm_impact = "Full" if "Full" in str(impact_type) else "Partial"

    if model is None:
        # Documented fallback heuristic if model artifact is unavailable
        score = 0.55 * (affected_percentage / 100.0) + 0.40 * min(affected_area / 5000.0, 1.0)
        return "High" if score >= 0.55 else ("Medium" if score >= 0.25 else "Low")

    try:
        df = pd.DataFrame([{
            "Affected_Area_m2": float(affected_area),
            "Affected_Percentage": float(affected_percentage),
            "Impact_Type": norm_impact
        }])
        pred = model.predict(df)[0]
        return str(pred)
    except Exception as e:
        logger.error(f"Error predicting priority for single parcel: {e}")
        score = 0.55 * (affected_percentage / 100.0) + 0.40 * min(affected_area / 5000.0, 1.0)
        return "High" if score >= 0.55 else ("Medium" if score >= 0.25 else "Low")


def predict_priority_batch(parcels_list: list) -> list:
    """
    Predict acquisition priority for a list of GIS-calculated affected parcel dictionaries.
    Modifies each parcel dictionary in-place by adding 'priority'.
    """
    if not parcels_list:
        return parcels_list

    model = load_priority_model()

    if model is None:
        logger.warning("ML priority model not available; using heuristic priority assignment.")
        for p in parcels_list:
            aff_area = float(p.get("affected_area") or 0.0)
            aff_pct = float(p.get("affected_percentage") or 0.0)
            score = 0.55 * (aff_pct / 100.0) + 0.40 * min(aff_area / 5000.0, 1.0)
            p["priority"] = "High" if score >= 0.55 else ("Medium" if score >= 0.25 else "Low")
        return parcels_list

    try:
        # Build features DataFrame with exact column names expected by the pipeline
        feature_rows = []
        for p in parcels_list:
            aff_area = float(p.get("affected_area") or 0.0)
            aff_pct = float(p.get("affected_percentage") or 0.0)
            imp_type = "Full" if "Full" in str(p.get("impact_type", "")) else "Partial"
            feature_rows.append({
                "Affected_Area_m2": aff_area,
                "Affected_Percentage": aff_pct,
                "Impact_Type": imp_type,
            })

        df_features = pd.DataFrame(feature_rows)
        predictions = model.predict(df_features)

        for p, pred in zip(parcels_list, predictions):
            p["priority"] = str(pred)

    except Exception as e:
        logger.error(f"Batch priority prediction failed: {e}. Applying fallback.")
        for p in parcels_list:
            if "priority" not in p:
                aff_area = float(p.get("affected_area") or 0.0)
                aff_pct = float(p.get("affected_percentage") or 0.0)
                score = 0.55 * (aff_pct / 100.0) + 0.40 * min(aff_area / 5000.0, 1.0)
                p["priority"] = "High" if score >= 0.55 else ("Medium" if score >= 0.25 else "Low")

    return parcels_list
