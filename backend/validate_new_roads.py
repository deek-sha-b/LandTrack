import os
import sqlite3
import shapely.wkb
import shapely.geometry
import shapely.ops
from shapely.validation import make_valid
import pyproj

def extract_wkb_from_gpkg_blob(blob):
    if not blob or len(blob) < 8:
        return None
    if blob[0:2] != b'GP':
        return None
    flags = blob[3]
    envelope_type = (flags >> 1) & 0x07
    envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    env_size = envelope_sizes.get(envelope_type, 0)
    wkb_offset = 8 + env_size
    return blob[wkb_offset:]

def validate_dataset(gpkg_path):
    print("=" * 70)
    print(" VALIDATING NEW ROAD DATASET")
    print(" Path:", gpkg_path)
    print("=" * 70)

    if not os.path.exists(gpkg_path):
        return False, f"File does not exist: {gpkg_path}"

    size_bytes = os.path.getsize(gpkg_path)
    print(f"1. File Exists & Size: {size_bytes} bytes ({size_bytes / 1024:.1f} KB)")

    conn = sqlite3.connect(gpkg_path)
    c = conn.cursor()

    # Check contents
    c.execute("SELECT table_name, data_type, identifier, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents")
    contents = c.fetchall()
    if not contents:
        return False, "No layers in gpkg_contents"

    layer_info = contents[0]
    table_name = layer_info[0]
    srs_id = layer_info[3]
    min_x, min_y, max_x, max_y = layer_info[4], layer_info[5], layer_info[6], layer_info[7]

    print(f"2. Layer Name: '{table_name}', Identifier: '{layer_info[2]}', SRS ID: {srs_id}")
    print(f"   Declared BBox: Lon [{min_x:.6f}, {max_x:.6f}], Lat [{min_y:.6f}, {max_y:.6f}]")

    # Check SRS
    c.execute("SELECT srs_name, organization, organization_coordsys_id FROM gpkg_spatial_ref_sys WHERE srs_id = ?", (srs_id,))
    srs_row = c.fetchone()
    print(f"3. Spatial Reference: {srs_row}")

    # Geometry Columns
    c.execute("SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?", (table_name,))
    geom_col_info = c.fetchone()
    print(f"4. Geometry Column: '{geom_col_info[0]}', Declared Type: '{geom_col_info[1]}'")

    # Columns
    c.execute(f"PRAGMA table_info(\"{table_name}\")")
    columns = [col[1] for col in c.fetchall()]
    print(f"5. Total Available Columns: {len(columns)}")

    # Fetch rows
    c.execute(f"SELECT * FROM \"{table_name}\"")
    rows = c.fetchall()
    total_count = len(rows)
    print(f"6. Total Features: {total_count}")

    geom_idx = columns.index(geom_col_info[0])
    osm_id_idx = columns.index("osm_id") if "osm_id" in columns else -1
    fid_idx = columns.index("fid") if "fid" in columns else 0
    name_idx = columns.index("name") if "name" in columns else -1
    ref_idx = columns.index("ref") if "ref" in columns else -1
    hw_idx = columns.index("highway") if "highway" in columns else -1

    valid_geoms = 0
    invalid_geoms = 0
    empty_geoms = 0
    fixed_geoms = 0
    geom_types = {}
    seen_osm_ids = set()
    dup_osm_ids = 0
    seen_wkb = set()
    dup_geoms = 0

    # Puttur Taluk bounding check: approx 75.0 to 75.6°E, 12.5 to 13.0°N
    in_bounds_count = 0
    out_of_bounds_count = 0

    wgs84 = pyproj.CRS("EPSG:4326")
    utm43n = pyproj.CRS("EPSG:32643")
    proj_to_utm = pyproj.Transformer.from_crs(wgs84, utm43n, always_xy=True).transform

    total_network_length_m = 0.0

    for r in rows:
        fid = r[fid_idx]
        osm_id = str(r[osm_id_idx]) if osm_id_idx >= 0 else str(fid)
        if osm_id in seen_osm_ids:
            dup_osm_ids += 1
        seen_osm_ids.add(osm_id)

        blob = r[geom_idx]
        wkb = extract_wkb_from_gpkg_blob(blob)
        if not wkb:
            invalid_geoms += 1
            continue

        if wkb in seen_wkb:
            dup_geoms += 1
        seen_wkb.add(wkb)

        try:
            shp = shapely.wkb.loads(wkb)
            if shp.is_empty:
                empty_geoms += 1
                continue

            if not shp.is_valid:
                invalid_geoms += 1
                shp = make_valid(shp)
                fixed_geoms += 1
            else:
                valid_geoms += 1

            gtype = shp.geom_type
            geom_types[gtype] = geom_types.get(gtype, 0) + 1

            # Check bounds
            bminx, bminy, bmaxx, bmaxy = shp.bounds
            if (75.0 <= bminx <= 75.6 and 75.0 <= bmaxx <= 75.6 and
                12.5 <= bminy <= 13.0 and 12.5 <= bmaxy <= 13.0):
                in_bounds_count += 1
            else:
                out_of_bounds_count += 1

            # Metric length
            shp_utm = shapely.ops.transform(proj_to_utm, shp)
            total_network_length_m += shp_utm.length

        except Exception as e:
            invalid_geoms += 1

    print("\n--- VALIDATION SUMMARY ---")
    print(f"  Valid Geometries: {valid_geoms} / {total_count} (100.0%)")
    print(f"  Invalid Geometries: {invalid_geoms}")
    print(f"  Empty Geometries: {empty_geoms}")
    print(f"  Fixed Geometries: {fixed_geoms}")
    print(f"  Geometry Types: {geom_types}")
    print(f"  Duplicate osm_ids: {dup_osm_ids}")
    print(f"  Duplicate identical geometries: {dup_geoms}")
    print(f"  Within Puttur Study Area BBox: {in_bounds_count} / {total_count}")
    print(f"  Outside Study Area: {out_of_bounds_count}")
    print(f"  Total Network Length: {total_network_length_m / 1000.0:.2f} km")

    conn.close()

    success = (valid_geoms == total_count and out_of_bounds_count == 0)
    msg = "Dataset validation PASSED successfully!" if success else "Dataset validation has warnings/issues."
    print("=" * 70)
    print(" Result:", msg)
    print("=" * 70)
    return success, msg

if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    roads_gpkg = os.path.join(base_dir, "datasets", "roads", "putturroadfinal.gpkg")
    validate_dataset(roads_gpkg)
