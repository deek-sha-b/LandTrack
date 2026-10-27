import os
import sys

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(__file__))

from database import check_db_connection, get_engine
from sqlalchemy import text

status = check_db_connection()
print('DB Connection Check:')
print(status)

engine = get_engine()
if engine:
    try:
        with engine.connect() as conn:
            tables = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).fetchall()
            print('\nTables in public schema:', [t[0] for t in tables])
            
            has_table = conn.execute(text("SELECT to_regclass('public.cadastral_parcels')")).scalar()
            print('cadastral_parcels table registration:', has_table)
            if has_table:
                cnt = conn.execute(text("SELECT COUNT(*) FROM cadastral_parcels")).scalar()
                print('Row count in cadastral_parcels:', cnt)
                if cnt > 0:
                    sample = conn.execute(text("SELECT id, gpkg_fid, survey_number, ST_AsText(geom) FROM cadastral_parcels LIMIT 1")).fetchone()
                    print('Sample row:', sample[0], sample[1], sample[2], sample[3][:60])
    except Exception as e:
        print('DB query error:', e)
