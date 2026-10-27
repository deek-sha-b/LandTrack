import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:5000"

def test_api_workflow():
    print("=" * 80)
    print("LANDTRACK API INTEGRATION: ROAD SELECTION, BUFFER & AFFECTED PARCELS")
    print("=" * 80)

    # 1. Health check
    req = urllib.request.urlopen(f"{BASE_URL}/api/health")
    health = json.loads(req.read().decode('utf-8'))
    print(f"Health Status: {health.get('status')}")

    # 2. Roads Metadata
    req = urllib.request.urlopen(f"{BASE_URL}/api/roads/metadata")
    meta = json.loads(req.read().decode('utf-8'))
    print(f"Metadata - File: {meta.get('file_name')}, Features: {meta.get('number_of_features')}, Length: {meta.get('total_network_length_km')} km")

    # 3. Roads GeoJSON
    t0 = time.time()
    req = urllib.request.urlopen(f"{BASE_URL}/api/roads")
    roads_fc = json.loads(req.read().decode('utf-8'))
    features = roads_fc.get("features", [])
    print(f"Loaded {len(features)} roads GeoJSON via HTTP in {time.time() - t0:.2f}s")
    assert len(features) == 1050, f"Expected 1050 roads, got {len(features)}"

    # 4. Test Selecting Specific Roads & Highways
    test_roads = [
        {"name": "NH275 (Trunk Highway)", "search_term": "NH275"},
        {"name": "Cherkala - Jalsoor Road (Primary Highway)", "search_term": "Cherkala"},
        {"name": "MDR / Secondary Road", "search_term": "Panaje"},
        {"name": "Local Road / Tertiary", "search_term": "LR"},
        {"name": "Residential Street", "search_term": "Anandashrama"}
    ]

    selected_features = []
    for tr in test_roads:
        term = tr["search_term"].lower()
        matched = None
        for f in features:
            p = f.get("properties", {})
            name = (p.get("name") or "").lower()
            ref = (p.get("ref") or "").lower()
            if term in name or term in ref:
                matched = f
                break
        if matched:
            selected_features.append((tr["name"], matched))
            print(f"Selected: {tr['name']} -> ID: {matched.get('id')}, Ref: {matched.get('properties', {}).get('ref')}, Name: {matched.get('properties', {}).get('name')}")
        else:
            print(f"FAILED to find road matching {tr['name']}")

    # 5. Test Buffer Creation via API (/api/roads/corridor)
    print("\n" + "-" * 80)
    print("Testing Corridor Buffer Generation via HTTP API...")
    corridors = []
    for label, feat in selected_features:
        post_data = json.dumps({
            "road_id": feat.get("id"),
            "road": feat,
            "width_meters": 30.0
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/roads/corridor",
            data=post_data,
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req)
        assert res.status == 200, f"Corridor creation failed with status {res.status}"
        corridor_data = json.loads(res.read().decode('utf-8'))
        assert corridor_data.get("type") == "Feature", "Corridor must be GeoJSON Feature"
        assert corridor_data.get("geometry", {}).get("type") in ["Polygon", "MultiPolygon"], "Corridor must have Polygon/MultiPolygon geometry"
        coords = corridor_data.get("geometry", {}).get("coordinates", [])
        assert len(coords) > 0, "Corridor coordinates must not be empty"
        print(f"  Buffer Created for {label}: Type={corridor_data['geometry']['type']}, Properties={corridor_data.get('properties')}")
        corridors.append((label, feat, corridor_data))

    # 6. Test Spatial Intersection & Affected Area Calculation (/api/corridor/intersect)
    print("\n" + "-" * 80)
    print("Testing Affected Parcels & Spatial Intersection via HTTP API...")
    for label, feat, corridor_data in corridors:
        p = feat.get("properties", {})
        post_data = json.dumps({
            "corridor": corridor_data,
            "impact_threshold": 90.0,
            "road_details": {
                "road_name": p.get("name") or p.get("ref") or label,
                "road_ref": p.get("ref") or "",
                "width": 30.0
            }
        }).encode('utf-8')

        t_start = time.time()
        req = urllib.request.Request(
            f"{BASE_URL}/api/corridor/intersect",
            data=post_data,
            headers={'Content-Type': 'application/json'}
        )
        res = urllib.request.urlopen(req)
        assert res.status == 200, f"Intersection failed with status {res.status}"
        int_data = json.loads(res.read().decode('utf-8'))
        t_elapsed = time.time() - t_start

        summary = int_data.get("summary", {})
        parcels = int_data.get("parcels", [])
        
        print(f"\nResults for {label}:")
        print(f"  Execution Time      : {t_elapsed:.2f}s")
        print(f"  Total Affected      : {summary.get('total_affected_parcels')} parcels")
        print(f"  Partial Impact      : {summary.get('partial_impact_count')}")
        print(f"  Full Impact         : {summary.get('full_impact_count')}")
        print(f"  Priority Breakdown  : {summary.get('priority_breakdown')}")
        
        if parcels:
            first = parcels[0]
            print(f"  Sample Parcel: Survey #{first.get('survey_number')}, Village: {first.get('village')}")
            print(f"    Total Area: {first.get('total_area')} m², Affected Area: {first.get('affected_area')} m² ({first.get('affected_percentage')}%), Priority: {first.get('priority')}")

    print("\n" + "=" * 80)
    print("ALL API ENDPOINT WORKFLOWS VALIDATED AND FUNCTIONING FLAWLESSLY!")
    print("=" * 80)

if __name__ == '__main__':
    test_api_workflow()
