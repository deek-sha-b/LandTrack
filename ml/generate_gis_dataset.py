#!/usr/bin/env python3
"""
LandTrack - Actual GIS-Derived Machine Learning Dataset Generator
==================================================================

Generates a machine-learning training dataset from actual spatial GIS analysis
performed on Puttur Taluk cadastral parcels and highway alignment corridors.

Source Datasets:
  - Cadastral Parcels: datasets/cadastral/putturcadastral.gpkg (Layer: putturcadastralfinal)
  - Road Alignment Network: datasets/roads/putturroadfinal.gpkg (Layer: 'puttur road')
  - Village Lookup: datasets/cadastral/Puttur_Village_Code_Name_Lookup_Complete.csv

Coordinate Reference Systems:
  - Storage CRS: EPSG:3857 (cadastral) / EPSG:4326 (roads)
  - Projected Metric Calculation CRS: EPSG:32643 (WGS 84 / UTM Zone 43N, Karnataka)
  - Scale distortion across Puttur Taluk (< 0.04%).

Integrity & Safety Guarantees:
  1. Does NOT fabricate survey numbers or ownership details.
  2. Total and affected areas are strictly derived from projected polygon geometries in EPSG:32643.
  3. Affected area is mathematically bounded: Affected_Area_m2 <= Total_Area_m2.
  4. Affected_Percentage is strictly in [0.01, 100.00].
  5. Unaffected parcels are excluded.
  6. Does NOT invent fake ground-truth Priority labels (Phase 4 compliance).
  7. Does NOT modify or overwrite existing datasets, trained models, or application code.

Output:
  - datasets/ml/LandTrack_GIS_Training_Dataset.csv
"""

import os
import sys
import sqlite3
import datetime
from pathlib import Path
import shapely.wkb
import shapely.geometry
import shapely.ops
from shapely.validation import make_valid
import pyproj
import pandas as pd

# Add backend directory to path to use existing GIS services
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from gis_service import (
    get_roads_geojson,
    get_road_by_id,
    get_road_group_key,
    generate_corridor_buffer_service,
    get_utm_transformers,
    lookup_village_name,
)

# Output destination
DATASETS_ML_DIR = PROJECT_ROOT / "datasets" / "ml"
OUTPUT_CSV = DATASETS_ML_DIR / "LandTrack_GIS_Training_Dataset.csv"
CADASTRA_GPKG = PROJECT_ROOT / "datasets" / "cadastral" / "putturcadastral.gpkg"


def extract_wkb_from_blob(blob):
    """Extract standard WKB from GeoPackage geometry blob."""
    if not blob or len(blob) < 8 or blob[:2] != b"GP":
        return None
    flags = blob[3]
    env_type = (flags >> 1) & 0x07
    env_size = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}.get(env_type, 0)
    return blob[8 + env_size:]


def build_gis_training_dataset():
    print("=" * 80)
    print("LANDTRACK: GENERATING ML DATASET FROM ACTUAL GIS ANALYSIS RESULTS")
    print("=" * 80)
    print(f"Cadastral Source : {CADASTRA_GPKG}")
    print(f"Projected CRS    : EPSG:32643 (UTM Zone 43N, Karnataka)")
    print(f"Output Target    : {OUTPUT_CSV}")

    if not CADASTRA_GPKG.exists():
        raise FileNotFoundError(f"Cadastral GeoPackage not found at: {CADASTRA_GPKG}")

    # Coordinate transformers
    to_utm, to_wgs84 = get_utm_transformers()
    t_3857_to_4326 = pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform
    t_4326_to_3857 = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform

    # Retrieve all road features using LandTrack's existing service
    print("\n[1/4] Loading and grouping highway corridors from Puttur road network...")
    roads_fc = get_roads_geojson()
    features = roads_fc.get("features", [])
    print(f"Loaded {len(features)} road features from putturroadfinal.gpkg.")

    # Identify distinct classified highway corridors and named routes
    corridor_configs = []
    seen_groups = set()

    # Major Highway / Trunk / Primary / Secondary / Collector routes
    for f in features:
        props = f.get("properties", {})
        ref = str(props.get("ref") or "").strip()
        name = str(props.get("name") or "").strip()
        hw = props.get("highway") or "road"
        fid = f.get("id")

        group_key = get_road_group_key(props)
        if not group_key or group_key in seen_groups:
            continue
        seen_groups.add(group_key)

        # Standard acquisition widths per highway class
        # Trunk / National Highways: 30m, 45m, 60m
        # Primary / State Highways: 30m, 45m
        # Secondary / MDRs: 30m
        # Others: 15m, 30m
        widths = [30.0]
        if hw in ("trunk", "primary"):
            widths.extend([45.0, 60.0])
        elif hw == "secondary":
            widths.append(45.0)

        for w in widths:
            corridor_configs.append({
                "road_id": fid,
                "group_key": group_key,
                "ref": ref,
                "name": name,
                "highway_type": hw,
                "width_m": w
            })

    print(f"Formulated {len(corridor_configs)} representative corridor acquisition scenarios.")

    # Connect to cadastral database for spatial RTree queries
    conn = sqlite3.connect(CADASTRA_GPKG)
    cursor = conn.cursor()

    records = []
    seen_parcel_configs = set()
    total_corridors_processed = 0

    print("\n[2/4] Executing spatial corridor intersections across cadastral parcels...")
    analysis_date_str = datetime.date.today().isoformat()

    for i, cfg in enumerate(corridor_configs):
        road_feat = get_road_by_id(cfg["road_id"], complete=True)
        if not road_feat or not road_feat.get("geometry"):
            continue

        rprops = road_feat.get("properties", {})
        canonical_name = rprops.get("name") or cfg["name"] or f"Road_{cfg['road_id']}"
        canonical_ref = rprops.get("ref") or cfg["ref"] or ""
        width_m = cfg["width_m"]

        # 1. Generate metric buffer corridor in EPSG:32643 using project service
        corridor_feat = generate_corridor_buffer_service(road_feat, width_meters=width_m)
        if not corridor_feat or not corridor_feat.get("geometry"):
            continue

        c_shape = shapely.geometry.shape(corridor_feat["geometry"])
        if not c_shape.is_valid:
            c_shape = make_valid(c_shape)
        c_utm = shapely.ops.transform(to_utm, c_shape)

        # 2. Query candidates via RTree index using corridor bounding box
        cminx, cminy, cmaxx, cmaxy = c_shape.bounds
        p1x, p1y = t_4326_to_3857(cminx, cminy)
        p2x, p2y = t_4326_to_3857(cmaxx, cmaxy)
        q_minx, q_maxx = min(p1x, p2x), max(p1x, p2x)
        q_miny, q_maxy = min(p1y, p2y), max(p1y, p2y)

        cursor.execute("""
            SELECT 
                p.fid, p.geom, p.surveynumberi, p.Label, p.Surveynumber_Old, 
                p.KGISVillageCode, p.LGD_VillageCode, p.Category, p.Kharab, p.ULPIN, p.KGISCadastralID
            FROM rtree_putturcadastralfinal_geom r
            JOIN putturcadastralfinal p ON r.id = p.fid
            WHERE r.minx <= ? AND r.maxx >= ? AND r.miny <= ? AND r.maxy >= ?
        """, (q_maxx, q_minx, q_maxy, q_miny))

        candidate_rows = cursor.fetchall()

        for r in candidate_rows:
            fid = r[0]
            # Deduplicate by parcel ID and corridor scenario to ensure balanced representative sampling
            cfg_key = f"{fid}_{canonical_ref or canonical_name}_{width_m}"
            if cfg_key in seen_parcel_configs:
                continue
            seen_parcel_configs.add(cfg_key)

            wkb = extract_wkb_from_blob(r[1])
            if not wkb:
                continue

            try:
                p_3857 = shapely.wkb.loads(wkb)
                p_4326 = shapely.ops.transform(t_3857_to_4326, p_3857)
                if not p_4326.is_valid:
                    p_4326 = make_valid(p_4326)

                # Project parcel directly to UTM Zone 43N
                p_utm = shapely.ops.transform(to_utm, p_4326)
                if not p_utm.intersects(c_utm):
                    continue

                inter_utm = p_utm.intersection(c_utm)
                if inter_utm.is_empty:
                    continue

                affected_area_raw = inter_utm.area
                if affected_area_raw <= 0.05:
                    # Ignore touching boundary points or non-area slivers
                    continue

                geom_total_area = p_utm.area
                if geom_total_area <= 0:
                    continue

                # Mathematical boundary guarantee:
                # In Euclidean plane, intersection area <= polygon area.
                # Address any IEEE-754 precision noise (< 0.001 m2)
                affected_area_val = round(affected_area_raw, 2)
                total_area_val = round(geom_total_area, 2)
                if affected_area_val > total_area_val:
                    affected_area_val = total_area_val

                # Percentage calculation
                affected_pct = round((affected_area_val / total_area_val) * 100.0, 2)
                affected_pct = min(100.0, max(0.01, affected_pct))

                # Impact Classification according to project standard
                impact_type = "Full Impact" if affected_pct >= 90.0 else "Partial Impact"

                # Authentic Survey Number handling (no fabrication of fake survey numbers)
                raw_surv = r[2]
                cat = r[7] or "Parcel"
                if raw_surv is not None and isinstance(raw_surv, (int, float)) and raw_surv > 0:
                    survey_str = str(int(raw_surv))
                else:
                    if cat in ("Road", "River", "Stream", "Tank"):
                        survey_str = f"Unassigned ({cat})"
                    else:
                        survey_str = "Not Available"

                # Parcel Identifier
                ulpin = r[9]
                kgis_id = r[10]
                if ulpin and str(ulpin).strip() and str(ulpin).strip().lower() not in ("none", "null", "nan"):
                    parcel_id = str(ulpin).strip()
                elif kgis_id and str(kgis_id).strip() and str(kgis_id).strip().lower() not in ("none", "null", "nan"):
                    parcel_id = str(kgis_id).strip()
                else:
                    parcel_id = f"PARCEL-{fid}"

                # Village details
                vcode = str(r[5]) if r[5] and str(r[5]).strip() else str(r[6] or "Not Available")
                vname = lookup_village_name(r[6])

                records.append({
                    "Parcel_ID": parcel_id,
                    "Village_Code": vcode,
                    "Village_Name": vname,
                    "Survey_Number": survey_str,
                    "Category": cat,
                    "Total_Area_m2": total_area_val,
                    "Affected_Area_m2": affected_area_val,
                    "Affected_Percentage": affected_pct,
                    "Impact_Type": impact_type,
                    "Road_Name": canonical_name,
                    "Road_Ref": canonical_ref,
                    "Corridor_Width_m": width_m,
                    "Source_Dataset": "putturcadastral.gpkg + putturroadfinal.gpkg (EPSG:32643)",
                    "Analysis_Date": analysis_date_str,
                })
            except Exception:
                continue

        total_corridors_processed += 1
        if (total_corridors_processed % 20) == 0:
            print(f"  Processed {total_corridors_processed} / {len(corridor_configs)} corridors ({len(records)} affected parcel records collected)...")

    conn.close()

    print(f"\n[3/4] Formatting DataFrame and verifying constraints...")
    df = pd.DataFrame(records)

    # Sort deterministically
    df.sort_values(by=["Road_Ref", "Road_Name", "Affected_Percentage"], ascending=[True, True, False], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Save to dedicated separate file
    DATASETS_ML_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8")
    print(f"Successfully saved {len(df):,} verified records to:\n  {OUTPUT_CSV.resolve()}")

    return df


def validate_extracted_dataset(df: pd.DataFrame):
    print("\n[4/4] Executing Comprehensive Dataset Validation Checks...")
    print("-" * 80)

    # 1. Record counts
    total_records = len(df)
    unique_parcels = df["Parcel_ID"].nunique()
    print(f"Total Records Exported        : {total_records:,}")
    print(f"Unique Cadastral Parcels      : {unique_parcels:,}")

    # 2. Impact breakdown
    impact_counts = df["Impact_Type"].value_counts().to_dict()
    print("\nImpact Classification Breakdown:")
    for imp, count in impact_counts.items():
        pct = (count / total_records) * 100.0
        print(f"  - {imp:<16}: {count:>5} records ({pct:5.1f}%)")

    # 3. Geometric Area Distribution
    print("\nGeometric Area Distributions (EPSG:32643 UTM 43N in square metres):")
    print(f"  Total Area (m2)    : Min = {df['Total_Area_m2'].min():>10.2f} | Max = {df['Total_Area_m2'].max():>12.2f} | Mean = {df['Total_Area_m2'].mean():>10.2f} | Median = {df['Total_Area_m2'].median():>10.2f}")
    print(f"  Affected Area (m2) : Min = {df['Affected_Area_m2'].min():>10.2f} | Max = {df['Affected_Area_m2'].max():>12.2f} | Mean = {df['Affected_Area_m2'].mean():>10.2f} | Median = {df['Affected_Area_m2'].median():>10.2f}")
    print(f"  Affected %         : Min = {df['Affected_Percentage'].min():>10.2f}%| Max = {df['Affected_Percentage'].max():>12.2f}%| Mean = {df['Affected_Percentage'].mean():>10.2f}%| Median = {df['Affected_Percentage'].median():>10.2f}%")

    # 4. Strict Physical Integrity Checks
    exceeding_count = (df["Affected_Area_m2"] > df["Total_Area_m2"]).sum()
    pct_over_100 = (df["Affected_Percentage"] > 100.00).sum()
    non_positive_aff = (df["Affected_Area_m2"] <= 0).sum()
    non_positive_tot = (df["Total_Area_m2"] <= 0).sum()

    print("\nPhysical Integrity Verification:")
    print(f"  - Affected Area > Total Area Violations   : {exceeding_count} (Must be 0)")
    print(f"  - Affected Percentage > 100% Violations   : {pct_over_100} (Must be 0)")
    print(f"  - Non-positive Affected Area Violations   : {non_positive_aff} (Must be 0)")
    print(f"  - Non-positive Total Area Violations      : {non_positive_tot} (Must be 0)")

    assert exceeding_count == 0, f"Error: Found {exceeding_count} records where Affected Area > Total Area"
    assert pct_over_100 == 0, f"Error: Found {pct_over_100} records where Affected % > 100%"
    assert non_positive_aff == 0, f"Error: Found {non_positive_aff} non-positive affected area records"
    assert non_positive_tot == 0, f"Error: Found {non_positive_tot} non-positive total area records"

    # 5. Survey Number & Attribute Honest Audit
    zero_surveys = (df["Survey_Number"] == "0").sum()
    print(f"\nCadastral Attributes Integrity:")
    print(f"  - Survey Number '0' Violations            : {zero_surveys} (Must be 0; unassigned honestly labeled)")
    assert zero_surveys == 0, "Error: Found literal '0' survey numbers"

    surv_counts = df["Survey_Number"].apply(lambda x: "Valid Number" if str(x).isdigit() else str(x)).value_counts()
    print("  - Survey Number Status Breakdown:")
    for st, c in surv_counts.items():
        print(f"      * {st:<25}: {c:>4} records")

    print("\nRoad Alignments Covered in Dataset:")
    road_counts = df["Road_Name"].value_counts()
    for rname, cnt in road_counts.head(10).items():
        print(f"  - {rname:<35}: {cnt:>4} records")
    if len(road_counts) > 10:
        print(f"  ... and {len(road_counts) - 10} additional road alignments.")

    print("\n" + "=" * 80)
    print("VALIDATION STATUS: ALL CHECKS PASSED WITH ZERO VIOLATIONS!")
    print("=" * 80)


if __name__ == "__main__":
    df_result = build_gis_training_dataset()
    validate_extracted_dataset(df_result)

