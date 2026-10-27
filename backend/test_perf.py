import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from gis_service import get_cadastral_parcels_gpkg

t0 = time.time()
res_3500 = get_cadastral_parcels_gpkg(limit=3500)
t1 = time.time()
print(f"3500 parcels: {len(res_3500['features'])} features returned in {t1 - t0:.2f} seconds")

t2 = time.time()
res_all = get_cadastral_parcels_gpkg(limit=12000)
t3 = time.time()
print(f"All parcels: {len(res_all['features'])} features returned in {t3 - t2:.2f} seconds")
