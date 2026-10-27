import urllib.request
import json
import time

url = 'http://127.0.0.1:5000/api/cadastral/parcels?limit=3500'
req = urllib.request.Request(url, headers={'Origin': 'http://localhost:5173'})

t0 = time.time()
with urllib.request.urlopen(req) as resp:
    print("Status code:", resp.status)
    data = json.loads(resp.read().decode('utf-8'))
    t1 = time.time()
    print(f"Features returned: {len(data.get('features', []))} in {t1 - t0:.2f}s")
