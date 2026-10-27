-- ====================================================================
-- LANDTRACK: Cadastral Parcels Table Schema (PostgreSQL + PostGIS)
-- Study Area: Puttur Taluk, Karnataka, India
-- Layer: Puttur_Parcels (from datasets/cadastral/Puttur_Cadastral_Final.gpkg)
-- ====================================================================

-- 1. Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Cadastral Parcels Table
CREATE TABLE IF NOT EXISTS cadastral_parcels (
    id SERIAL PRIMARY KEY,
    gpkg_fid INTEGER UNIQUE NOT NULL,
    objectid INTEGER,
    kgis_cadastral_id INTEGER,
    kgis_village_id INTEGER,
    survey_number INTEGER,
    survey_number_label VARCHAR(100),
    survey_number_old VARCHAR(100),
    kgis_village_code VARCHAR(50),
    unique_village_code VARCHAR(50),
    bhu_code VARCHAR(50),
    lgd_village_code INTEGER,
    category VARCHAR(50),
    area_sqm DOUBLE PRECISION,
    perimeter_m DOUBLE PRECISION,
    kharab VARCHAR(50),
    ulpin VARCHAR(100),
    last_edited_user VARCHAR(100),
    geom GEOMETRY(MultiPolygon, 4326)
);

-- 3. High-Performance Spatial and Attribute Indexes
CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_geom ON cadastral_parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_survey ON cadastral_parcels (survey_number);
CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_village ON cadastral_parcels (kgis_village_code);
CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_lgd ON cadastral_parcels (lgd_village_code);
CREATE INDEX IF NOT EXISTS idx_cadastral_parcels_ulpin ON cadastral_parcels (ulpin);

-- 4. Puttur Roads & Highways Table
-- Study Area: Puttur Highway Network (NH275 / SH88 / SH55 / MDR alignment)
-- Layer: 'puttur road' (from datasets/roads/putturroadfinal.gpkg)
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

-- 5. High-Performance Spatial and Attribute Indexes for Roads
CREATE INDEX IF NOT EXISTS idx_puttur_roads_geom ON puttur_roads USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_puttur_roads_ref ON puttur_roads (ref);
CREATE INDEX IF NOT EXISTS idx_puttur_roads_name ON puttur_roads (name);
CREATE INDEX IF NOT EXISTS idx_puttur_roads_highway ON puttur_roads (highway);
CREATE INDEX IF NOT EXISTS idx_puttur_roads_osm_id ON puttur_roads (osm_id);

