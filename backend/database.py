import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base = declarative_base()

_engine = None
_SessionLocal = None

_engine_init_attempted = False

def get_engine(force=False):
    global _engine, _engine_init_attempted
    if force:
        _engine = None
        _engine_init_attempted = False
    if _engine is None and not _engine_init_attempted:
        _engine_init_attempted = True
        try:
            _engine = create_engine(
                Config.SQLALCHEMY_DATABASE_URI,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
                connect_args={"connect_timeout": 2}
            )
        except Exception as e:
            logger.warning(f"Could not initialize PostgreSQL engine: {e}")
            _engine = None
    return _engine

def get_session():
    global _SessionLocal
    engine = get_engine()
    if engine is None:
        return None
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return _SessionLocal()

import time

_db_status_cache = None
_db_status_last_check = 0
DB_CACHE_TTL = 10  # seconds

def check_db_connection(force=False):
    """
    Checks if PostgreSQL is reachable and verifies if the PostGIS extension is installed.
    Returns a status dict suitable for health check endpoints.
    Cached for 10s to ensure fast sub-millisecond responses.
    """
    global _db_status_cache, _db_status_last_check
    now = time.time()
    if not force and _db_status_cache is not None and (now - _db_status_last_check) < DB_CACHE_TTL:
        return _db_status_cache

    engine = get_engine()
    if not engine:
        res = {
            "connected": False,
            "postgis_installed": False,
            "database": Config.DB_NAME,
            "host": f"{Config.DB_HOST}:{Config.DB_PORT}",
            "message": "Engine initialization failed. Please verify PostgreSQL connection details in .env."
        }
        _db_status_cache = res
        _db_status_last_check = now
        return res

    
    try:
        with engine.connect() as conn:
            # Check basic connection
            conn.execute(text("SELECT 1"))
            
            # Check for PostGIS extension
            postgis_check = conn.execute(
                text("SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis'")
            ).fetchone()
            
            if postgis_check:
                res = {
                    "connected": True,
                    "postgis_installed": True,
                    "postgis_version": postgis_check[1],
                    "database": Config.DB_NAME,
                    "host": f"{Config.DB_HOST}:{Config.DB_PORT}",
                    "message": "PostgreSQL database and PostGIS extension are active and connected."
                }
            else:
                res = {
                    "connected": True,
                    "postgis_installed": False,
                    "database": Config.DB_NAME,
                    "host": f"{Config.DB_HOST}:{Config.DB_PORT}",
                    "message": "Connected to PostgreSQL, but the 'postgis' extension is not enabled yet in this database. Run 'CREATE EXTENSION postgis;' to enable it."
                }
    except Exception as e:
        res = {
            "connected": False,
            "postgis_installed": False,
            "database": Config.DB_NAME,
            "host": f"{Config.DB_HOST}:{Config.DB_PORT}",
            "message": f"Could not connect to PostgreSQL ({str(e)}). Ensure PostgreSQL service is running and credentials in .env are correct."
        }

    _db_status_cache = res
    _db_status_last_check = now
    return res

