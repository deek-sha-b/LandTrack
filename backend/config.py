import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)
load_dotenv()

class Config:
    """Application configuration for LandTrack backend."""
    
    # Flask settings
    SECRET_KEY = os.getenv('SECRET_KEY', 'landtrack-secret-key-dev-2026')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    DEBUG = os.getenv('FLASK_DEBUG', '1') == '1'
    PORT = int(os.getenv('PORT', 5000))
    
    # Project Metadata
    PROJECT_NAME = "LandTrack"
    PROJECT_TITLE = "AI/ML-Based GIS Land Acquisition Management System for Highway Development"
    STUDY_AREA = "Puttur, Karnataka, India"
    
    # PostgreSQL / PostGIS configuration
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'postgres')
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'landtrack_db')
    
    # SQLAlchemy Database URI (explicitly using psycopg2 driver)
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Dataset paths
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    DATASETS_DIR = os.path.join(BASE_DIR, 'datasets')
    CADASTRAL_DIR = os.path.join(DATASETS_DIR, 'cadastral')
    ROADS_DIR = os.path.join(DATASETS_DIR, 'roads')
    LAND_RECORDS_DIR = os.path.join(DATASETS_DIR, 'land_records')
    MODELS_DIR = os.path.join(BASE_DIR, 'models')
    ROADS_GPKG = os.path.join(ROADS_DIR, 'putturroadfinal.gpkg')
    ROADS_FILE = ROADS_GPKG if os.path.exists(ROADS_GPKG) else os.path.join(ROADS_DIR, 'road.geojson')
    if not os.path.exists(ROADS_FILE):
        alt_roads = os.path.join(ROADS_DIR, 'export.geojson')
        if os.path.exists(alt_roads):
            ROADS_FILE = alt_roads
    CADASTRAL_FILE = os.path.join(CADASTRAL_DIR, 'putturcadastral.gpkg')
    if not os.path.exists(CADASTRAL_FILE):
        for candidate in ['Puttur_Taluk_Cadastral.gpkg', 'Puttur_Cadastral_Final.gpkg']:
            cand_path = os.path.join(CADASTRAL_DIR, candidate)
            if os.path.exists(cand_path):
                CADASTRAL_FILE = cand_path
                break
        else:
            # Check for any .gpkg in CADASTRAL_DIR
            if os.path.exists(CADASTRAL_DIR):
                gpkgs = [f for f in os.listdir(CADASTRAL_DIR) if f.lower().endswith('.gpkg')]
                if gpkgs:
                    CADASTRAL_FILE = os.path.join(CADASTRAL_DIR, gpkgs[0])
    VILLAGE_LOOKUP_FILE = os.path.join(CADASTRAL_DIR, 'Puttur_Village_Code_Name_Lookup_Complete.csv')
    ML_DIR = os.path.join(BASE_DIR, 'ml')
    ML_MODEL_PATH = os.path.join(ML_DIR, 'landtrack_priority_model.pkl')


