from flask import Flask, jsonify, request
from flask_cors import CORS
from config import Config
from database import check_db_connection
from gis_service import (
    get_cadastral_geojson, get_cadastral_metadata, is_postgis_ready,
    get_roads_geojson, get_roads_metadata, is_roads_postgis_ready,
    get_road_by_id, generate_corridor_buffer_service,
    intersect_corridor_with_parcels, lookup_village_name, get_village_lookup
)
from load_cadastral import load_data_to_postgis
from load_roads import load_roads_to_postgis
from ml_service import (
    load_priority_model, is_model_ready, get_model_info,
    predict_priority_batch, predict_priority_single
)
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS for all frontend interactions
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Load the saved ML model pipeline using joblib only once when the backend starts
logger.info("Initializing LandTrack ML priority model...")
load_priority_model()

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint returning system status, project details,
    and PostgreSQL / PostGIS connection status for both cadastral and roads layers.
    """
    db_status = check_db_connection()
    postgis_ready = is_postgis_ready()
    roads_pg_ready = is_roads_postgis_ready()
    ml_ready = is_model_ready()
    return jsonify({
        "status": "healthy",
        "service": Config.PROJECT_NAME,
        "title": Config.PROJECT_TITLE,
        "study_area": Config.STUDY_AREA,
        "version": "1.0.0",
        "database": db_status,
        "cadastral_ready": True,
        "cadastral_source": "PostgreSQL / PostGIS" if postgis_ready else f"OGC GeoPackage ({os.path.basename(Config.CADASTRAL_FILE)})",
        "roads_ready": True,
        "roads_source": "PostgreSQL / PostGIS (puttur_roads)" if roads_pg_ready else f"GeoJSON ({os.path.basename(Config.ROADS_FILE)})",
        "ml_model_ready": ml_ready,
        "ml_model_info": get_model_info()
    }), 200

@app.route('/api/status', methods=['GET'])
def system_status():
    """
    Returns directory structure status and verification of datasets & models folders.
    """
    def check_dir(path):
        exists = os.path.exists(path)
        count = len(os.listdir(path)) if exists else 0
        return {"exists": exists, "file_count": count}

    return jsonify({
        "project": Config.PROJECT_NAME,
        "study_area": Config.STUDY_AREA,
        "directories": {
            "cadastral": check_dir(Config.CADASTRAL_DIR),
            "roads": check_dir(Config.ROADS_DIR),
            "land_records": check_dir(Config.LAND_RECORDS_DIR),
            "models": check_dir(Config.MODELS_DIR)
        },
        "cadastral_file": {
            "path": Config.CADASTRAL_FILE,
            "exists": os.path.exists(Config.CADASTRAL_FILE),
            "size_bytes": os.path.getsize(Config.CADASTRAL_FILE) if os.path.exists(Config.CADASTRAL_FILE) else 0
        },
        "roads_file": {
            "path": Config.ROADS_FILE,
            "exists": os.path.exists(Config.ROADS_FILE),
            "size_bytes": os.path.getsize(Config.ROADS_FILE) if os.path.exists(Config.ROADS_FILE) else 0
        },
        "database": check_db_connection()
    }), 200

# ============================================================================
# CADASTRAL GIS API ENDPOINTS
# ============================================================================

@app.route('/api/cadastral/metadata', methods=['GET'])
def cadastral_metadata():
    """
    Returns Puttur Cadastral dataset metadata (layer name, CRS, total parcels, bounds, center).
    """
    try:
        meta = get_cadastral_metadata()
        return jsonify(meta), 200
    except Exception as e:
        logger.error(f"Error fetching cadastral metadata: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadastral/parcels', methods=['GET'])
def cadastral_parcels():
    """
    Returns cadastral parcels as GeoJSON FeatureCollection.
    Supports optional bounding box filtering: ?bbox=minx,miny,maxx,maxy
    Optional filters:
      - ?survey_no=17
      - ?village_code=617686
      - ?parcel_id=74PY9JD8ACGY
      - ?search=123
      - ?limit=3500
    """
    try:
        # Parse query params
        bbox_str = request.args.get('bbox')
        survey_no = request.args.get('survey_no')
        village_code = request.args.get('village_code')
        parcel_id = request.args.get('parcel_id')
        search = request.args.get('search') or request.args.get('q')
        limit = int(request.args.get('limit', 25000))

        minx, miny, maxx, maxy = None, None, None, None
        if bbox_str:
            coords = [float(c.strip()) for c in bbox_str.split(',') if c.strip()]
            if len(coords) == 4:
                minx, miny, maxx, maxy = coords

        geojson = get_cadastral_geojson(
            minx=minx,
            miny=miny,
            maxx=maxx,
            maxy=maxy,
            survey_no=survey_no,
            village_code=village_code,
            parcel_id=parcel_id,
            search=search,
            limit=limit
        )
        return jsonify(geojson), 200
    except Exception as e:
        logger.error(f"Error fetching cadastral parcels: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadastral/parcels/<int:fid>', methods=['GET'])
def cadastral_parcel_detail(fid):
    """
    Returns single parcel GeoJSON feature by its FID or ID.
    Queries PostGIS first for high performance, with GPKG fallback.
    """
    try:
        from database import get_engine
        from sqlalchemy import text
        import json

        if is_postgis_ready():
            engine = get_engine()
            query = text("""
                SELECT 
                    id,
                    gpkg_fid,
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
                    # kharab,
                    ulpin,
                    kgis_cadastral_id,
                    ST_AsGeoJSON(geom) as geojson
                FROM cadastral_parcels
                WHERE gpkg_fid = :fid OR id = :fid
                LIMIT 1;
            """)
            with engine.connect() as conn:
                r = conn.execute(query, {"fid": fid}).fetchone()
                if r:
                    geom = json.loads(r.geojson) if r.geojson else None
                    area_m2 = r.area_sqm or 0.0
                    survey_display = str(r.survey_number) if r.survey_number is not None else (r.survey_number_label or "Not Available")
                    return jsonify({
                        "type": "Feature",
                        "id": r.gpkg_fid,
                        "geometry": geom,
                        "properties": {
                            "fid": r.gpkg_fid,
                            "survey_number": survey_display,
                            "village": lookup_village_name(r.lgd_village_code),
                            "village_code": r.kgis_village_code or "Not Available",
                            "unique_village_code": r.unique_village_code or "Not Available",
                            "bhu_code": r.bhu_code or "Not Available",
                            "lgd_village_code": r.lgd_village_code if r.lgd_village_code is not None else "Not Available",
                            "category": r.category or "Parcel",
                            "area_sqm": round(area_m2, 2),
                            "area_acres": round(area_m2 / 4046.86, 3),
                            "perimeter_m": round(r.perimeter_m or 0.0, 2),
                            "kharab": r.kharab if r.kharab else "Nil",
                            "ulpin": r.ulpin if r.ulpin else "Not Available",
                            "kgis_cadastral_id": r.kgis_cadastral_id
                        }
                    }), 200

        # Direct GPKG Fallback
        from gis_service import extract_wkb_from_gpkg_blob, GPKG_PATH, get_gpkg_layer_and_srs
        import sqlite3, shapely.wkb, shapely.geometry, pyproj
        
        layer_name, srs_id = get_gpkg_layer_and_srs(GPKG_PATH)
        conn = sqlite3.connect(GPKG_PATH)
        c = conn.cursor()
        c.execute(f"""
            SELECT 
                fid, geom, surveynumberi, Label, Surveynumber_Old, 
                KGISVillageCode, UniqueVillageCode, bhucode, LGD_VillageCode, 
                Category, "SHAPE.STArea()", "SHAPE.STLength()", Kharab, ULPIN, KGISCadastralID
            FROM "{layer_name}"
            WHERE fid = ?
        """, (fid,))
        r = c.fetchone()
        conn.close()
        
        if not r:
            return jsonify({"error": f"Parcel with FID {fid} not found"}), 404
            
        wkb = extract_wkb_from_gpkg_blob(r[1])
        if not wkb:
            return jsonify({"error": f"No geometry found for parcel {fid}"}), 404

        shapely_geom = shapely.wkb.loads(wkb)
        if srs_id == 3857:
            transformer = pyproj.Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True).transform
            shapely_geom = shapely.ops.transform(transformer, shapely_geom)
        geom = shapely.geometry.mapping(shapely_geom)
        area_m2 = r[10] or 0.0
        survey_display = str(r[2]) if r[2] is not None else (r[3] or "Not Available")
        
        feature = {
            "type": "Feature",
            "id": r[0],
            "geometry": geom,
            "properties": {
                "fid": r[0],
                "survey_number": survey_display,
                "village": lookup_village_name(r[8]),
                "village_code": r[5] or "Not Available",
                "unique_village_code": r[6] or "Not Available",
                "bhu_code": r[7] or "Not Available",
                "lgd_village_code": r[8] if r[8] is not None else "Not Available",
                "category": r[9] or "Parcel",
                "area_sqm": round(area_m2, 2),
                "area_acres": round(area_m2 / 4046.86, 3),
                "perimeter_m": round(r[11] or 0.0, 2),
                "kharab": r[12] if r[12] else "Nil",
                "ulpin": r[13] if r[13] else "Not Available",
                "kgis_cadastral_id": r[14]
            }
        }
        return jsonify(feature), 200
    except Exception as e:
        logger.error(f"Error fetching parcel {fid}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/cadastral/villages', methods=['GET'])
def cadastral_villages():
    """
    Returns the village code to village name lookup table
    sourced from datasets/cadastral/Puttur_Village_Code_Name_Lookup_Complete.csv.
    """
    try:
        lookup = get_village_lookup()
        return jsonify({
            "lookup": lookup,
            "total_villages": len(lookup),
            "study_area": Config.STUDY_AREA
        }), 200
    except Exception as e:
        logger.error(f"Error returning village lookup: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/load-postgis', methods=['POST'])
def trigger_load_postgis():
    """
    Admin endpoint to trigger loading cadastral data from GPKG into PostGIS.
    """
    try:
        success, msg = load_data_to_postgis()
        status_code = 200 if success else 400
        return jsonify({"success": success, "message": msg}), status_code
    except Exception as e:
        logger.error(f"Error loading data to PostGIS: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================================================
# PUTTUR ROADS & HIGHWAYS API ENDPOINTS
# ============================================================================

@app.route('/api/roads/metadata', methods=['GET'])
def roads_metadata():
    """
    Returns Puttur road dataset inspection metadata:
    file format, CRS, geometry type, road name field, road number field,
    unique road ID, number of road features, and highway corridor attributes.
    """
    try:
        meta = get_roads_metadata()
        return jsonify(meta), 200
    except Exception as e:
        logger.error(f"Error fetching roads metadata: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/roads', methods=['GET'])
@app.route('/api/roads/geojson', methods=['GET'])
def get_roads():
    """
    Returns Puttur Roads & Highways as GeoJSON FeatureCollection.
    Backed by PostgreSQL / PostGIS if connected, or direct high-performance GeoJSON.
    """
    try:
        geojson = get_roads_geojson()
        return jsonify(geojson), 200
    except Exception as e:
        logger.error(f"Error fetching roads GeoJSON: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/roads/<path:road_id>', methods=['GET'])
def get_single_road(road_id):
    """
    Returns single road feature details by ID or osm_id.
    """
    try:
        road = get_road_by_id(road_id)
        if not road:
            return jsonify({"error": f"Road with ID '{road_id}' not found"}), 404
        return jsonify(road), 200
    except Exception as e:
        logger.error(f"Error fetching road {road_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/roads/corridor', methods=['POST'])
def generate_road_corridor():
    """
    Generates a GIS buffer (acquisition corridor) around a selected road
    using projected CRS EPSG:32643 (UTM Zone 43N) for exact metric distances.
    Accepts: { "road_id": 1, "width_meters": 30 } or { "road": <feature>, "width_meters": 30 }
    """
    try:
        data = request.get_json(silent=True) or {}
        road_target = data.get("road") or data.get("road_id")
        width_m = data.get("width_meters") or data.get("width", 30.0)

        if not road_target:
            return jsonify({"error": "Either 'road_id' or 'road' feature is required."}), 400

        corridor_feature = generate_corridor_buffer_service(road_target, width_m)
        if not corridor_feature:
            return jsonify({"error": "Failed to generate corridor buffer for road."}), 500

        return jsonify(corridor_feature), 200
    except Exception as e:
        logger.error(f"Error generating road corridor: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/load-roads-postgis', methods=['POST'])
def trigger_load_roads_postgis():
    """
    Admin endpoint to trigger loading Puttur road features into PostGIS table 'puttur_roads'.
    """
    try:
        success, msg = load_roads_to_postgis()
        status_code = 200 if success else 400
        return jsonify({"success": success, "message": msg}), status_code
    except Exception as e:
        logger.error(f"Error loading roads to PostGIS: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/corridor/intersect', methods=['POST'])
def intersect_corridor():
    """
    Performs spatial intersection between the acquisition corridor and cadastral parcels.
    Returns actual calculated affected parcels, areas, percentages, and impact classifications.
    Supports configurable impact_threshold (default: 90.0%) and road details.
    """
    try:
        data = request.get_json(silent=True) or {}
        corridor = data.get("corridor") or data
        impact_threshold = float(data.get("impact_threshold", 90.0))
        road_details = data.get("road_details") or {
            "road_name": data.get("road_name"),
            "road_ref": data.get("road_ref"),
            "width": data.get("width") or data.get("width_meters")
        }
        result = intersect_corridor_with_parcels(corridor, impact_threshold=impact_threshold, road_details=road_details)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error intersecting corridor with parcels: {e}")
        return jsonify({"error": str(e), "parcels": [], "summary": {"total_affected_parcels": 0, "partial_impact_count": 0, "full_impact_count": 0}}), 500

@app.route('/api/ml/predict-priority', methods=['POST'])
def predict_priority_endpoint():
    """
    Direct ML prediction endpoint.
    Predicts acquisition priority ('Low', 'Medium', 'High') from
    Affected_Area_m2, Affected_Percentage, and Impact_Type.
    Supports single item or batch list in 'parcels'.
    """
    try:
        data = request.get_json(silent=True) or {}
        if "parcels" in data and isinstance(data["parcels"], list):
            parcels = data["parcels"]
            predict_priority_batch(parcels)
            return jsonify({
                "parcels": parcels,
                "count": len(parcels)
            }), 200
        else:
            area = float(data.get("affected_area") or data.get("Affected_Area_m2", 0.0))
            pct = float(data.get("affected_percentage") or data.get("Affected_Percentage", 0.0))
            imp = str(data.get("impact_type") or data.get("Impact_Type", "Partial"))
            prio = predict_priority_single(area, pct, imp)
            return jsonify({
                "priority": prio,
                "affected_area": area,
                "affected_percentage": pct,
                "impact_type": imp
            }), 200
    except Exception as e:
        logger.error(f"Error predicting priority in endpoint: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = Config.PORT
    print(f"================================================================")
    print(f" {Config.PROJECT_NAME} Backend API")
    print(f" {Config.PROJECT_TITLE}")
    print(f" Study Area: {Config.STUDY_AREA}")
    print(f" Cadastral Dataset: {Config.CADASTRAL_FILE}")
    print(f" Roads Dataset: {Config.ROADS_FILE}")
    print(f" ML Priority Model: {'Loaded & Ready' if is_model_ready() else 'Not Found'}")
    print(f" Starting server on http://localhost:{port}")
    print(f" Health check: http://localhost:{port}/api/health")
    print(f" Cadastral GeoJSON: http://localhost:{port}/api/cadastral/parcels")
    print(f" Roads GeoJSON: http://localhost:{port}/api/roads")
    print(f" Roads Metadata: http://localhost:{port}/api/roads/metadata")
    print(f" ML Predict API: http://localhost:{port}/api/ml/predict-priority")
    print(f"================================================================")
    app.run(host='0.0.0.0', port=port, debug=Config.DEBUG)

