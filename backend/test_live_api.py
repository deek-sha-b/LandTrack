import urllib.request
import json

url = 'http://127.0.0.1:5000/api/cadastral/parcels?limit=5'
req = urllib.request.Request(url, headers={'Origin': 'http://localhost:5173'})

with urllib.request.urlopen(req) as resp:
    print("Status code:", resp.status)
    print("Access-Control-Allow-Origin:", resp.headers.get('Access-Control-Allow-Origin'))
    data = json.loads(resp.read().decode('utf-8'))
    print("GeoJSON type:", data.get('type'))
    print("Features count:", len(data.get('features', [])))
    print("Source:", data.get('source'))
    print("CRS:", data.get('crs'))
    f0 = data['features'][0]
    print("First feature properties:", f0['properties'])
    print("First feature geometry type:", f0['geometry']['type'])
    print("First feature sample coord:", f0['geometry']['coordinates'][0][0][0])
