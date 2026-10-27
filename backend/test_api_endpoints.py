import json
from app import app

def test_endpoints():
    client = app.test_client()

    print("1. Health check:")
    res = client.get('/api/health')
    print("   Status:", res.status_code, res.get_json())

    print("\n2. Roads metadata:")
    res = client.get('/api/roads/metadata')
    print("   Status:", res.status_code)
    meta = res.get_json()
    print("   File:", meta.get("file_name"), "Features:", meta.get("number_of_features"), "CRS:", meta.get("crs"), "Length km:", meta.get("total_network_length_km"))

    print("\n3. Single road detail (id=1):")
    res = client.get('/api/roads/1')
    print("   Status:", res.status_code)
    road_feat = res.get_json()
    print("   Road props:", road_feat.get("properties"))

    print("\n4. Generate corridor buffer (id=1, width=30m):")
    res = client.post('/api/roads/corridor', json={"road_id": 1, "width_meters": 30})
    print("   Status:", res.status_code)
    corridor_feat = res.get_json()
    print("   Corridor geom type:", corridor_feat.get("geometry", {}).get("type"))
    print("   Corridor props:", corridor_feat.get("properties"))

    print("\n5. Intersect corridor with cadastral parcels:")
    res = client.post('/api/corridor/intersect', json={
        "corridor": corridor_feat,
        "impact_threshold": 90.0,
        "road_name": road_feat.get("properties", {}).get("name") or "NH275 Trunk Highway",
        "road_ref": road_feat.get("properties", {}).get("ref"),
        "width_meters": 30
    })
    print("   Status:", res.status_code)
    intersect_data = res.get_json()
    summary = intersect_data.get("summary")
    print("   Summary:", summary)
    parcels = intersect_data.get("parcels", [])
    print(f"   Affected parcels returned: {len(parcels)}")
    for p in parcels[:3]:
        print(f"     FID {p['id']}, Survey: {p['survey_number']}, Total: {p['total_area']} m2, Affected: {p['affected_area']} m2 ({p['affected_percentage']}%) -> {p['impact_type']}")

if __name__ == "__main__":
    test_endpoints()
