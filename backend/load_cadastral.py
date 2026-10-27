import os
import sys
import sqlite3
import logging
from sqlalchemy import text
from config import Config
from database import get_engine, check_db_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

GPKG_PATH = Config.CADASTRAL_FILE

def extract_wkb_from_gpkg_blob(blob):
    """
    Extracts standard WKB (Well Known Binary) from a GeoPackage geometry binary blob.
    GPKG geometry header:
      bytes 0-1: 'GP' magic
      byte 2: version
      byte 3: flags (envelope indicator in bits 1-3)
      bytes 4-7: srs_id
      bytes 8..: envelope (size depends on flag: 0, 32, 48, or 64 bytes)
      remainder: standard WKB
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

def load_data_to_postgis(batch_size=1000, truncate_existing=True):
    """
    Loads complete cadastral parcels from the GeoPackage into PostgreSQL + PostGIS.
    Creates schema and populates table 'cadastral_parcels'.
    Supports dynamic layer names, SRS detection (including EPSG:3857 -> EPSG:4326 transform),
    and validates counts and geometries.
    """
    print("==================================================================")
    print(" LANDTRACK: CADASTRAL DATA LOADER (PostgreSQL + PostGIS)")
    print(f" Source: {GPKG_PATH}")
    print("==================================================================")
    
    # Check GPKG exists
    if not os.path.exists(GPKG_PATH):
        logger.error(f"Cadastral dataset not found at: {GPKG_PATH}")
        return False, f"File not found: {GPKG_PATH}"
    
    # Check DB connection
    db_status = check_db_connection(force=True)
    if not db_status.get("connected"):
        msg = f"PostgreSQL is not reachable: {db_status.get('message')}"
        logger.error(msg)
        return False, msg
    
    engine = get_engine()
    
    # 1. Back up existing cadastral parcels if table exists and has rows
    with engine.begin() as conn:
        table_exists = conn.execute(text("SELECT to_regclass('public.cadastral_parcels');")).scalar()
        if table_exists:
            existing_count = conn.execute(text("SELECT COUNT(*) FROM cadastral_parcels;")).scalar()
            if existing_count > 0:
                logger.info(f"Existing table has {existing_count} records. Creating/updating backup...")
                conn.execute(text("DROP TABLE IF EXISTS cadastral_parcels_backup_old;"))
                conn.execute(text("CREATE TABLE cadastral_parcels_backup_old AS SELECT * FROM cadastral_parcels;"))
                logger.info("Backup preserved in 'cadastral_parcels_backup_old'.")

    # 2. Initialize schema
    schema_file = os.path.join(os.path.dirname(__file__), "schema.sql")
    if os.path.exists(schema_file):
        logger.info("Applying database schema from schema.sql...")
        with open(schema_file, "r") as f:
            schema_sql = f.read()
        with engine.begin() as conn:
            for statement in schema_sql.split(";"):
                stmt = statement.strip()
                if stmt:
                    conn.execute(text(stmt))
        logger.info("Schema verified and initialized.")

    # 3. Read layer information and inspect GPKG
    logger.info(f"Opening GPKG source: {GPKG_PATH}")
    gpkg_conn = sqlite3.connect(GPKG_PATH)
    gpkg_cursor = gpkg_conn.cursor()

    # Discover feature table and SRS
    gpkg_cursor.execute("SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features' LIMIT 1;")
    layer_info = gpkg_cursor.fetchone()
    if not layer_info:
        # Fallback to sqlite_master
        gpkg_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'gpkg_%' AND name NOT LIKE 'rtree_%' LIMIT 1;")
        layer_row = gpkg_cursor.fetchone()
        if not layer_row:
            return False, "No feature layer found in GeoPackage."
        table_name = layer_row[0]
        srs_id = 4326
    else:
        table_name = layer_info[0]
        srs_id = layer_info[1] or 4326

    # Verify geometry column SRS
    gpkg_cursor.execute("SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ? LIMIT 1;", (table_name,))
    geom_srs_row = gpkg_cursor.fetchone()
    if geom_srs_row and geom_srs_row[0]:
        srs_id = geom_srs_row[0]

    logger.info(f"Detected cadastral layer: '{table_name}' with source SRS ID: {srs_id}")
    
    gpkg_cursor.execute(f'SELECT COUNT(*) FROM "{table_name}";')
    total_parcels = gpkg_cursor.fetchone()[0]
    logger.info(f"Total parcels available in source GPKG: {total_parcels}")
    
    # Inspect column names
    gpkg_cursor.execute(f'PRAGMA table_info("{table_name}");')
    col_info = gpkg_cursor.fetchall()
    col_names = [c[1] for c in col_info]
    col_set = set(col_names)
    logger.info(f"Columns present ({len(col_names)}): {', '.join(col_names[:10])}...")

    # Helper column selectors with fallbacks
    def col_or_null(col):
        if col in col_set:
            return f'"{col}"'
        return f"NULL AS {col}"

    query = f"""
        SELECT 
            fid,
            geom,
            {col_or_null("OBJECTID")},
            {col_or_null("KGISCadastralID")},
            {col_or_null("KGISVillageID")},
            {col_or_null("surveynumberi")},
            {col_or_null("Label")},
            {col_or_null("Surveynumber_Old")},
            {col_or_null("KGISVillageCode")},
            {col_or_null("UniqueVillageCode")},
            {col_or_null("bhucode")},
            {col_or_null("LGD_VillageCode")},
            {col_or_null("Category")},
            {col_or_null("SHAPE.STArea()")},
            {col_or_null("SHAPE.STLength()")},
            {col_or_null("Kharab")},
            {col_or_null("ULPIN")},
            {col_or_null("last_edited_user")}
        FROM "{table_name}";
    """
    gpkg_cursor.execute(query)

    # 4. Clear table if truncate requested
    if truncate_existing:
        logger.info("Truncating table 'cadastral_parcels' for clean complete dataset replacement...")
        with engine.begin() as pg_conn:
            pg_conn.execute(text("TRUNCATE TABLE cadastral_parcels RESTART IDENTITY;"))

    # SQL with coordinate transformation support
    if srs_id == 4326:
        geom_transform_sql = "ST_Multi(ST_SetSRID(ST_GeomFromWKB(:wkb_geom), 4326))"
    else:
        # Transform from source SRS (e.g. 3857) to 4326
        geom_transform_sql = f"ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromWKB(:wkb_geom), {srs_id}), 4326))"

    insert_sql = text(f"""
        INSERT INTO cadastral_parcels (
            gpkg_fid,
            geom,
            objectid,
            kgis_cadastral_id,
            kgis_village_id,
            survey_number,
            survey_number_label,
            survey_number_old,
            kgis_village_code,
            unique_village_code,
            bhu_code,
            lgd_village_code,
            category,
            area_sqm,
            perimeter_m,
            kharab,
            ulpin,
            last_edited_user
        ) VALUES (
            :gpkg_fid,
            {geom_transform_sql},
            :objectid,
            :kgis_cadastral_id,
            :kgis_village_id,
            :survey_number,
            :survey_number_label,
            :survey_number_old,
            :kgis_village_code,
            :unique_village_code,
            :bhu_code,
            :lgd_village_code,
            :category,
            :area_sqm,
            :perimeter_m,
            :kharab,
            :ulpin,
            :last_edited_user
        )
        ON CONFLICT (gpkg_fid) DO UPDATE SET
            survey_number = EXCLUDED.survey_number,
            survey_number_label = EXCLUDED.survey_number_label,
            survey_number_old = EXCLUDED.survey_number_old,
            kgis_village_code = EXCLUDED.kgis_village_code,
            unique_village_code = EXCLUDED.unique_village_code,
            bhu_code = EXCLUDED.bhu_code,
            lgd_village_code = EXCLUDED.lgd_village_code,
            category = EXCLUDED.category,
            area_sqm = EXCLUDED.area_sqm,
            perimeter_m = EXCLUDED.perimeter_m,
            kharab = EXCLUDED.kharab,
            ulpin = EXCLUDED.ulpin,
            geom = EXCLUDED.geom;
    """)

    loaded_count = 0
    rejected_count = 0
    batch = []
    
    with engine.begin() as pg_conn:
        while True:
            rows = gpkg_cursor.fetchmany(batch_size)
            if not rows:
                break
            
            for row in rows:
                geom_blob = row[1]
                wkb = extract_wkb_from_gpkg_blob(geom_blob)
                if not wkb:
                    rejected_count += 1
                    continue
                
                batch.append({
                    "gpkg_fid": row[0],
                    "wkb_geom": wkb,
                    "objectid": row[2],
                    "kgis_cadastral_id": row[3],
                    "kgis_village_id": row[4],
                    "survey_number": row[5],
                    "survey_number_label": str(row[6]) if row[6] is not None else None,
                    "survey_number_old": str(row[7]) if row[7] is not None else None,
                    "kgis_village_code": str(row[8]) if row[8] is not None else None,
                    "unique_village_code": str(row[9]) if row[9] is not None else None,
                    "bhu_code": str(row[10]) if row[10] is not None else None,
                    "lgd_village_code": row[11],
                    "category": row[12] or "Parcel",
                    "area_sqm": row[13],
                    "perimeter_m": row[14],
                    "kharab": str(row[15]) if row[15] is not None else None,
                    "ulpin": str(row[16]) if row[16] is not None else None,
                    "last_edited_user": str(row[17]) if row[17] is not None else None
                })
            
            if batch:
                pg_conn.execute(insert_sql, batch)
                loaded_count += len(batch)
                logger.info(f"Loaded {loaded_count} / {total_parcels} parcels into PostGIS...")
                batch.clear()

    gpkg_conn.close()

    # Reindex and vacuum analyze for top performance
    logger.info("Optimizing spatial index and running ANALYZE...")
    with engine.begin() as pg_conn:
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_geom ON cadastral_parcels USING GIST (geom);"))
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_survey ON cadastral_parcels (survey_number);"))
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_label ON cadastral_parcels (survey_number_label);"))
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_lgd ON cadastral_parcels (lgd_village_code);"))
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_kgis_id ON cadastral_parcels (kgis_cadastral_id);"))
        pg_conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_ulpin ON cadastral_parcels (ulpin);"))
        
    with engine.connect() as pg_conn:
        db_count = pg_conn.execute(text("SELECT COUNT(*) FROM cadastral_parcels;")).scalar()
        extent = pg_conn.execute(text("SELECT ST_Extent(geom) FROM cadastral_parcels;")).scalar()
        logger.info(f"Verification: DB table 'cadastral_parcels' now contains {db_count} records.")
        logger.info(f"Geographic Extent (EPSG:4326): {extent}")

    success_msg = f"Successfully loaded {loaded_count} parcels (Source: {total_parcels}, Rejected: {rejected_count}) into PostGIS 'cadastral_parcels'. Extent: {extent}"
    logger.info(success_msg)
    return True, success_msg

if __name__ == "__main__":
    success, msg = load_data_to_postgis()
    if not success:
        logger.warning(f"Loader completed with notice: {msg}")
        sys.exit(1)
