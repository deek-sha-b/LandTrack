import os
import sqlite3
import json
import shapely.wkb
import shapely.geometry
import shapely.wkb
import shapely.geometry

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

def inspect_dataset():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    gpkg_path = os.path.join(base_dir, "datasets", "cadastral", "Puttur_Taluk_Cadastral.gpkg")
    print(f"Inspecting file: {gpkg_path}")
    print(f"File exists: {os.path.exists(gpkg_path)}")
    if not os.path.exists(gpkg_path):
        return
    print(f"File size: {os.path.getsize(gpkg_path)} bytes")

    conn = sqlite3.connect(gpkg_path)
    c = conn.cursor()

    c.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view');")
    print("Tables and Views in GPKG:")
    for row in c.fetchall():
        print(f"  {row[1]}: {row[0]}")
    
    # 1. Layer Name & Contents
    c.execute("SELECT table_name, data_type, identifier, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents;")
    contents = c.fetchall()
    print("\n1. GPKG Contents:")
    for row in contents:
        print(f"   Table: {row[0]}, Type: {row[1]}, Identifier: {row[2]}, SRS_ID: {row[3]}")
        print(f"   Bounding Box: min_x={row[4]}, min_y={row[5]}, max_x={row[6]}, max_y={row[7]}")
    
    # 2. CRS
    c.execute("SELECT srs_name, srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys;")
    srs = c.fetchall()
    print("\n2. CRS (Spatial Reference Systems):")
    for s in srs:
        print(f"   SRS Name: {s[0]}, SRS ID: {s[1]}, Org: {s[2]}, Org CoordSys ID: {s[3]}")
        print(f"   Definition: {s[4][:120]}...")
    
    # 3. Geometry columns
    c.execute("SELECT table_name, column_name, geometry_type_name, srs_id, z, m FROM gpkg_geometry_columns;")
    geom_cols = c.fetchall()
    print("\n3. Geometry Columns:")
    for g in geom_cols:
        print(f"   Table: {g[0]}, Column: {g[1]}, Geom Type: {g[2]}, SRS ID: {g[3]}, Z: {g[4]}, M: {g[5]}")
    
    # 4. Table info & count
    table_name = contents[0][0]
    c.execute(f"SELECT COUNT(*) FROM \"{table_name}\";")
    total_parcels = c.fetchone()[0]
    print(f"\n4. Layer Name: {table_name}")
    print(f"   Total Feature Count: {total_parcels}")
    
    c.execute(f"PRAGMA table_info(\"{table_name}\");")
    columns_info = c.fetchall()
    print("\n5. Columns:")
    for col in columns_info:
        print(f"   {col[1]} ({col[2]})")
        
    # Check valid geometries
    print("\n6. Geometry Validation:")
    c.execute(f"SELECT fid, geom FROM \"{table_name}\";")
    valid_count = 0
    invalid_count = 0
    geom_types = {}
    sample_shapely = None
    
    for fid, geom_blob in c.fetchall():
        wkb = extract_wkb_from_gpkg_blob(geom_blob)
        if not wkb:
            invalid_count += 1
            continue
        try:
            shp = shapely.wkb.loads(wkb)
            if shp.is_valid:
                valid_count += 1
            else:
                # Some may have minor self-intersections
                invalid_count += 1
            gtype = shp.geom_type
            geom_types[gtype] = geom_types.get(gtype, 0) + 1
            if sample_shapely is None:
                sample_shapely = shp
        except Exception as e:
            invalid_count += 1
            
    print(f"   Valid Geometries: {valid_count} / {total_parcels}")
    print(f"   Invalid / Error Geometries: {invalid_count}")
    print(f"   Geometry Types Breakdown: {geom_types}")
    if sample_shapely:
        print(f"   Sample Geometry Envelope: {sample_shapely.bounds}")

    conn.close()

if __name__ == "__main__":
    inspect_dataset()

