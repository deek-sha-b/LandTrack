import os
import sqlite3
import shapely.wkb
import shapely.geometry
import json

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

def inspect():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    roads_dir = os.path.join(base_dir, "datasets", "roads")
    files = os.listdir(roads_dir)
    print("Files in datasets/roads:", files)

    gpkg_path = os.path.join(roads_dir, "putturroadfinal.gpkg")
    if not os.path.exists(gpkg_path):
        print("GPKG does not exist!")
        return

    print("File size:", os.path.getsize(gpkg_path), "bytes")
    conn = sqlite3.connect(gpkg_path)
    c = conn.cursor()

    print("\n--- GPKG CONTENTS ---")
    for row in c.execute("SELECT table_name, data_type, identifier, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents"):
        print(" ", row)

    print("\n--- SPATIAL REF SYS ---")
    for row in c.execute("SELECT srs_name, srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys"):
        print(" ", row[0], row[1], row[2], row[3])

    print("\n--- GEOMETRY COLUMNS ---")
    for row in c.execute("SELECT table_name, column_name, geometry_type_name, srs_id, z, m FROM gpkg_geometry_columns"):
        print(" ", row)

    c.execute("SELECT table_name FROM gpkg_contents")
    tables = [r[0] for r in c.fetchall()]

    for t in tables:
        print(f"\n--- TABLE: {t} ---")
        c.execute(f"PRAGMA table_info(\"{t}\")")
        cols = c.fetchall()
        col_names = [col[1] for col in cols]
        geom_idx = col_names.index("geom") if "geom" in col_names else None

        c.execute(f"SELECT COUNT(*), COUNT(DISTINCT osm_id), COUNT(DISTINCT fid), COUNT(DISTINCT full_id) FROM \"{t}\"")
        counts = c.fetchone()
        print(f"  Total: {counts[0]}, Distinct osm_id: {counts[1]}, Distinct fid: {counts[2]}, Distinct full_id: {counts[3]}")

        c.execute(f"SELECT highway, count(*) FROM \"{t}\" GROUP BY highway ORDER BY count(*) DESC LIMIT 10")
        print("  Highway types:", c.fetchall())

        c.execute(f"SELECT count(*) FROM \"{t}\" WHERE name IS NOT NULL AND trim(name) != ''")
        has_name = c.fetchone()[0]
        c.execute(f"SELECT count(*) FROM \"{t}\" WHERE ref IS NOT NULL AND trim(ref) != ''")
        has_ref = c.fetchone()[0]
        print(f"  Features with name: {has_name}, with ref: {has_ref}")

        # Check duplicate geometries
        c.execute(f"SELECT fid, geom, osm_id, name, ref FROM \"{t}\"")
        rows = c.fetchall()
        geom_hashes = {}
        dup_geom_count = 0
        valid_count = 0
        invalid_count = 0
        empty_count = 0
        geom_types = {}

        for r in rows:
            blob = r[1]
            wkb = extract_wkb_from_gpkg_blob(blob)
            if not wkb:
                invalid_count += 1
                continue
            if wkb in geom_hashes:
                dup_geom_count += 1
            else:
                geom_hashes[wkb] = r[0]

            try:
                geom = shapely.wkb.loads(wkb)
                if geom.is_empty:
                    empty_count += 1
                elif geom.is_valid:
                    valid_count += 1
                else:
                    invalid_count += 1
                gtype = geom.geom_type
                geom_types[gtype] = geom_types.get(gtype, 0) + 1
            except Exception as e:
                invalid_count += 1

        print(f"  Geom breakdown: valid={valid_count}, invalid={invalid_count}, empty={empty_count}, types={geom_types}")
        print(f"  Duplicate identical geometry blobs: {dup_geom_count}")


    conn.close()

if __name__ == "__main__":
    inspect()
