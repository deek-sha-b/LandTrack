import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import app
from config import Config

print("Config CADASTRAL_FILE:", Config.CADASTRAL_FILE)
print("File exists:", os.path.exists(Config.CADASTRAL_FILE))

client = app.test_client()

# Test /api/health
res = client.get('/api/health')
print("\n/api/health response code:", res.status_code)
print("/api/health JSON:", res.get_json())

# Test /api/cadastral/metadata
res_meta = client.get('/api/cadastral/metadata')
print("\n/api/cadastral/metadata code:", res_meta.status_code)
print("/api/cadastral/metadata JSON:", res_meta.get_json())

# Test /api/cadastral/parcels
res_parcels = client.get('/api/cadastral/parcels?limit=5')
print("\n/api/cadastral/parcels code:", res_parcels.status_code)
parcels_json = res_parcels.get_json()
print("Total returned:", parcels_json.get('total_returned'))
print("Features count:", len(parcels_json.get('features', [])))
if parcels_json.get('features'):
    f0 = parcels_json['features'][0]
    print("Feature 0 id:", f0.get('id'))
    print("Feature 0 properties:", f0.get('properties'))
    print("Feature 0 geometry type:", f0.get('geometry', {}).get('type'))
    coords = f0.get('geometry', {}).get('coordinates', [])
    print("Feature 0 geometry sample coord:", coords[0][0][0] if coords and coords[0] and coords[0][0] else None)
