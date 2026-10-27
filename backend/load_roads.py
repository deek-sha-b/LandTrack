import os
import sys
import json
import sqlite3
import logging
import shapely.wkb
import shapely.geometry
from shapely.validation import make_valid
from sqlalchemy import text
from config import Config
from database import get_engine, check_db_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ROADS_GPKG = getattr(Config, 'ROADS_GPKG', os.path.join(Config.ROADS_DIR, 'putturroadfinal.gpkg'))
ROADS_FILE = Config.ROADS_FILE

def extract_wkb_from_gpkg_blob(blob):
    """
    Extracts standard WKB from GeoPackage geometry binary blob.
    """
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

def load_roads_from_gpkg(gpkg_path):
    """
    Reads, validates, and cleans road features from GeoPackage.
    Preserves all attributes and does NOT invent missing names.
    Returns list of cleaned feature dicts.
    """
    if not os.path.exists(gpkg_path):
        raise FileNotFoundError(f"GeoPackage file not found at: {gpkg_path}")

    conn = sqlite3.connect(gpkg_path)
    c = conn.cursor()

    # Identify layer
    c.execute("SELECT table_name FROM gpkg_contents WHERE data_type = 'features' LIMIT 1")
    row = c.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"No feature layer found in {gpkg_path}")
    table_name = row[0]

    c.execute(f"PRAGMA table_info(\"{table_name}\")")
    cols = [col[1] for col in c.fetchall()]

    c.execute(f"SELECT * FROM \"{table_name}\"")
    rows = c.fetchall()
    conn.close()

    cleaned_features = []
    seen_osm_ids = set()
    seen_geom_wkb = set()

    for r in rows:
        row_dict = {cols[i]: r[i] for i in range(len(cols))}
        blob = row_dict.get("geom")
        wkb = extract_wkb_from_gpkg_blob(blob)
        if not wkb:
            continue

        # Avoid exact duplicate geometries
        if wkb in seen_geom_wkb:
            continue
        seen_geom_wkb.add(wkb)

        try:
            geom = shapely.wkb.loads(wkb)
        except Exception:
            continue

        if geom.is_empty:
            continue

        if not geom.is_valid:
            geom = make_valid(geom)
            if geom.is_empty:
                continue

        # Extract identifiers
        osm_id = row_dict.get("osm_id")
        full_id = row_dict.get("full_id")
        fid = row_dict.get("fid")

        if not osm_id or str(osm_id).strip() == "":
            osm_id = str(full_id) if full_id else f"road_{fid}"

        osm_id_str = str(osm_id).strip()
        if osm_id_str in seen_osm_ids:
            # Append fid suffix to ensure uniqueness while preserving the ID
            osm_id_str = f"{osm_id_str}_{fid}"
        seen_osm_ids.add(osm_id_str)

        # Preserve exact attributes without inventing names
        name = row_dict.get("name")
        if name is not None:
            name = str(name).strip()
            if name == "" or name.lower() in ("none", "null", "nan"):
                name = None

        name_kn = row_dict.get("name:kn")
        if name_kn is not None:
            name_kn = str(name_kn).strip()
            if name_kn == "" or name_kn.lower() in ("none", "null", "nan"):
                name_kn = None

        name_en = row_dict.get("name:en")
        if name_en is not None:
            name_en = str(name_en).strip()
            if name_en == "" or name_en.lower() in ("none", "null", "nan"):
                name_en = None

        ref = row_dict.get("ref")
        if ref is not None:
            ref = str(ref).strip()
            if ref == "" or ref.lower() in ("none", "null", "nan"):
                ref = None

        ref_old = row_dict.get("ref:old")
        if ref_old is not None:
            ref_old = str(ref_old).strip()
            if ref_old == "" or ref_old.lower() in ("none", "null", "nan"):
                ref_old = None

        highway = row_dict.get("highway") or "road"
        highway = str(highway).strip().lower()

        geom_json = shapely.geometry.mapping(geom)

        cleaned_features.append({
            "osm_id": osm_id_str,
            "osm_type": str(row_dict.get("osm_type") or "way"),
            "full_id": str(full_id) if full_id else None,
            "name": name,
            "name_kn": name_kn,
            "name_en": name_en,
            "ref": ref,
            "ref_old": ref_old,
            "highway": highway,
            "lanes": str(row_dict.get("lanes")) if row_dict.get("lanes") else None,
            "surface": str(row_dict.get("surface")) if row_dict.get("surface") else None,
            "maxspeed": str(row_dict.get("maxspeed")) if row_dict.get("maxspeed") else None,
            "bridge": str(row_dict.get("bridge")) if row_dict.get("bridge") else None,
            "tunnel": str(row_dict.get("tunnel")) if row_dict.get("tunnel") else None,
            "layer": str(row_dict.get("layer")) if row_dict.get("layer") else None,
            "width": str(row_dict.get("width")) if row_dict.get("width") else None,
            "oneway": str(row_dict.get("oneway")) if row_dict.get("oneway") else None,
            "geom_json": json.dumps(geom_json)
        })

    logger.info(f"Loaded and validated {len(cleaned_features)} road features from {gpkg_path}")
    return cleaned_features

def load_roads_from_geojson(geojson_path):
    """
    Fallback loader for GeoJSON formatted roads.
    """
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    raw_features = data.get("features", [])
    cleaned_features = []
    seen_osm_ids = set()

    for idx, f in enumerate(raw_features):
        props = f.get("properties") or {}
        geom = f.get("geometry")
        if not geom:
            continue

        try:
            shp = shapely.geometry.shape(geom)
            if shp.is_empty:
                continue
            if not shp.is_valid:
                shp = make_valid(shp)
            geom_json = shapely.geometry.mapping(shp)
        except Exception:
            continue

        osm_id = f.get("id") or props.get("@id") or props.get("osm_id") or f"road_{idx+1}"
        osm_id_str = str(osm_id)
        if osm_id_str in seen_osm_ids:
            osm_id_str = f"{osm_id_str}_{idx+1}"
        seen_osm_ids.add(osm_id_str)

        cleaned_features.append({
            "osm_id": osm_id_str,
            "osm_type": "way" if str(osm_id_str).startswith("way") else "road",
            "full_id": props.get("full_id"),
            "name": props.get("name"),
            "name_kn": props.get("name:kn"),
            "name_en": props.get("name:en"),
            "ref": props.get("ref"),
            "ref_old": props.get("ref:old"),
            "highway": props.get("highway") or "road",
            "lanes": props.get("lanes"),
            "surface": props.get("surface"),
            "maxspeed": props.get("maxspeed"),
            "bridge": props.get("bridge"),
            "tunnel": props.get("tunnel"),
            "layer": props.get("layer"),
            "width": props.get("width"),
            "oneway": props.get("oneway"),
            "geom_json": json.dumps(geom_json)
        })

    return cleaned_features

def ensure_roads_schema(engine):
    """
    Ensures 'puttur_roads' table schema is ready to accept MultiLineString / Geometry,
    and includes all road attribute columns and spatial indexes.
    """
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))

        # Create or update table structure
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS puttur_roads (
                id SERIAL PRIMARY KEY,
                osm_id VARCHAR(100) UNIQUE NOT NULL,
                osm_type VARCHAR(20) DEFAULT 'way',
                full_id VARCHAR(100),
                name VARCHAR(255),
                name_kn VARCHAR(255),
                name_en VARCHAR(255),
                ref VARCHAR(50),
                ref_old VARCHAR(50),
                highway VARCHAR(50),
                lanes VARCHAR(20),
                surface VARCHAR(50),
                maxspeed VARCHAR(20),
                bridge VARCHAR(20),
                tunnel VARCHAR(20),
                layer VARCHAR(20),
                width VARCHAR(20),
                oneway VARCHAR(20),
                length_m DOUBLE PRECISION,
                geom GEOMETRY(Geometry, 4326)
            );
        """))

        # In case the table previously existed with GEOMETRY(LineString, 4326), alter to Geometry
        try:
            conn.execute(text("ALTER TABLE puttur_roads ALTER COLUMN geom TYPE GEOMETRY(Geometry, 4326);"))
        except Exception as e:
            logger.debug(f"Column geom type alter notice: {e}")

        # Add any newly introduced columns if table already existed
        for col_name, col_type in [
            ("full_id", "VARCHAR(100)"),
            ("name_en", "VARCHAR(255)"),
            ("tunnel", "VARCHAR(20)"),
            ("width", "VARCHAR(20)"),
            ("oneway", "VARCHAR(20)")
        ]:
            try:
                conn.execute(text(f"ALTER TABLE puttur_roads ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception as e:
                logger.debug(f"Add column {col_name} notice: {e}")

        # Indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_puttur_roads_geom ON puttur_roads USING GIST (geom);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_puttur_roads_ref ON puttur_roads (ref);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_puttur_roads_name ON puttur_roads (name);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_puttur_roads_highway ON puttur_roads (highway);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_puttur_roads_osm_id ON puttur_roads (osm_id);"))

    logger.info("Database schema and indexes for 'puttur_roads' verified.")

def load_roads_to_postgis():
    """
    Loads validated Puttur road features into PostgreSQL + PostGIS.
    Prioritizes the newly added GeoPackage dataset, with fallback to GeoJSON.
    """
    print("==================================================================")
    print(" LANDTRACK: PUTTUR ROADS & HIGHWAYS DATA LOADER (PostGIS)")
    print("==================================================================")

    # Check source file
    source_file = None
    if os.path.exists(ROADS_GPKG):
        source_file = ROADS_GPKG
        loader_func = load_roads_from_gpkg
    elif os.path.exists(ROADS_FILE):
        source_file = ROADS_FILE
        loader_func = load_roads_from_geojson
    else:
        msg = f"Roads dataset file not found at {ROADS_GPKG} or {ROADS_FILE}"
        logger.error(msg)
        return False, msg

    # Check DB connection
    db_status = check_db_connection()
    if not db_status.get("connected"):
        msg = f"PostgreSQL is not reachable: {db_status.get('message')}"
        logger.warning(msg)
        return False, msg

    engine = get_engine()

    # Load and validate features
    try:
        features = loader_func(source_file)
    except Exception as e:
        msg = f"Error reading road dataset from {source_file}: {e}"
        logger.error(msg)
        return False, msg

    total_roads = len(features)
    if total_roads == 0:
        return False, "No valid road features found to load."

    # Ensure schema exists and supports Geometry(Geometry, 4326)
    ensure_roads_schema(engine)

    # Clear old table and insert newly validated dataset cleanly
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE puttur_roads RESTART IDENTITY;"))

    insert_sql = text("""
        INSERT INTO puttur_roads (
            osm_id,
            osm_type,
            full_id,
            name,
            name_kn,
            name_en,
            ref,
            ref_old,
            highway,
            lanes,
            surface,
            maxspeed,
            bridge,
            tunnel,
            layer,
            width,
            oneway,
            length_m,
            geom
        ) VALUES (
            :osm_id,
            :osm_type,
            :full_id,
            :name,
            :name_kn,
            :name_en,
            :ref,
            :ref_old,
            :highway,
            :lanes,
            :surface,
            :maxspeed,
            :bridge,
            :tunnel,
            :layer,
            :width,
            :oneway,
            ST_Length(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom_json), 4326), 32643)),
            ST_SetSRID(ST_GeomFromGeoJSON(:geom_json), 4326)
        );
    """)

    batch_size = 200
    loaded_count = 0

    with engine.begin() as conn:
        for i in range(0, total_roads, batch_size):
            batch = features[i:i + batch_size]
            conn.execute(insert_sql, batch)
            loaded_count += len(batch)

    msg = f"Successfully loaded {loaded_count} validated Puttur road features from {os.path.basename(source_file)} into PostGIS table 'puttur_roads'."
    logger.info(msg)
    return True, msg

if __name__ == "__main__":
    success, msg = load_roads_to_postgis()
    if not success:
        logger.warning(f"Loader completed with notice: {msg}")
        sys.exit(1)
    else:
        logger.info("Done!")
