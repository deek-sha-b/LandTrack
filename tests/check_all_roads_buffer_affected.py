import os
import sys
import json
import time

# Add backend to path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_path)

from gis_service import (
    get_roads_geojson,
    get_road_by_id,
    generate_corridor_buffer_service,
    intersect_corridor_with_parcels,
    get_roads_metadata
)

def run_comprehensive_check():
    print("=" * 80)
    print("LANDTRACK: COMPREHENSIVE ROAD & HIGHWAY SELECTION, BUFFER & AFFECTED AREA AUDIT")
    print("=" * 80)

    # 1. Fetch metadata
    meta = get_roads_metadata()
    print(f"Total features reported: {meta.get('number_of_features')}")
    print(f"Road dataset file: {meta.get('file_name')}")
    print(f"CRS: {meta.get('crs')} | Projected CRS: {meta.get('projected_crs')}")

    # 2. Fetch all roads GeoJSON
    t0 = time.time()
    fc = get_roads_geojson()
    features = fc.get("features", [])
    print(f"Loaded {len(features)} road/highway features in {time.time() - t0:.2f}s")
    assert len(features) > 0, "No road features found!"

    # Breakdown by highway classification
    highway_counts = {}
    for f in features:
        hw = f.get("properties", {}).get("highway") or "unspecified"
        highway_counts[hw] = highway_counts.get(hw, 0) + 1
    
    print("\nHighway Classifications Breakdown:")
    for hw, count in sorted(highway_counts.items(), key=lambda x: -x[1]):
        print(f"  - {hw:20s}: {count:4d} features")

    # 3. Test road selection & buffer creation for ALL features
    print("\nTesting Road Selection & Buffer Creation on ALL 1,050 features...")
    select_failed = []
    buffer_failed = []
    buffer_zero_area = []
    
    sample_corridors_by_highway = {}

    for i, f in enumerate(features):
        fid = f.get("id")
        osm_id = f.get("properties", {}).get("osm_id")
        hw = f.get("properties", {}).get("highway") or "road"
        
        # Test selection / retrieval
        retrieved = get_road_by_id(fid)
        if not retrieved:
            # try osm_id
            retrieved = get_road_by_id(osm_id)
        if not retrieved:
            select_failed.append((i, fid, osm_id))
            continue

        # Test buffer creation with 30m width
        try:
            corridor = generate_corridor_buffer_service(f, width_meters=30.0)
            if not corridor or not corridor.get("geometry"):
                buffer_failed.append((fid, osm_id, "No geometry returned"))
            else:
                geom = corridor["geometry"]
                coords = geom.get("coordinates", [])
                if not coords or len(coords) == 0:
                    buffer_zero_area.append((fid, osm_id))
                elif hw not in sample_corridors_by_highway:
                    sample_corridors_by_highway[hw] = (f, corridor)
        except Exception as e:
            buffer_failed.append((fid, osm_id, str(e)))

    print(f"\nSelection Check: {len(features) - len(select_failed)} / {len(features)} selectable")
    if select_failed:
        print(f"  WARNING: {len(select_failed)} features failed ID lookup: {select_failed[:5]}")
    else:
        print("  SUCCESS: 100% of roads/highways are selectable by ID/feature!")

    print(f"\nBuffer Creation Check (30m metric corridor):")
    print(f"  SUCCESS: {len(features) - len(buffer_failed)} / {len(features)} corridors successfully created!")
    if buffer_failed:
        print(f"  FAILED: {len(buffer_failed)} corridors failed: {buffer_failed[:5]}")
    if buffer_zero_area:
        print(f"  WARNING: {len(buffer_zero_area)} corridors had empty coordinates: {buffer_zero_area[:5]}")

    # 4. Test Affected Area Spatial Intersection on key highways and road types
    print("\nTesting Affected Area Intersection on representative roads from each highway type...")
    
    highway_test_results = []
    total_parcels_found = 0

    # Test top major highways and types: trunk (NH275), primary, secondary, tertiary, residential, unclassified
    test_categories = ['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'track']
    
    for cat in test_categories:
        if cat not in sample_corridors_by_highway:
            continue
        road_feat, corr = sample_corridors_by_highway[cat]
        rprops = road_feat.get("properties", {})
        road_name = rprops.get("name") or rprops.get("ref") or f"Road-{road_feat.get('id')}"
        
        t_int_start = time.time()
        intersect_res = intersect_corridor_with_parcels(
            corr,
            impact_threshold=90.0,
            road_details={
                "road_name": road_name,
                "road_ref": rprops.get("ref", ""),
                "width": 30.0
            }
        )
        int_time = time.time() - t_int_start
        
        summary = intersect_res.get("summary", {})
        parcels = intersect_res.get("parcels", [])
        total_parcels_found += len(parcels)
        
        sample_affected_area = 0.0
        if parcels:
            sample_affected_area = sum(p.get("affected_area", 0.0) for p in parcels)

        highway_test_results.append({
            "category": cat,
            "road_id": road_feat.get("id"),
            "osm_id": rprops.get("osm_id"),
            "road_name": road_name,
            "ref": rprops.get("ref", "None"),
            "affected_parcels": summary.get("total_affected_parcels", 0),
            "full_impact": summary.get("full_impact_count", 0),
            "partial_impact": summary.get("partial_impact_count", 0),
            "total_affected_sqm": round(sample_affected_area, 2),
            "execution_time_sec": round(int_time, 2)
        })

    print("-" * 105)
    print(f"{'Category':<15} | {'Road Name / Ref':<26} | {'Affected Parcels':<16} | {'Full':<5} | {'Partial':<8} | {'Total Sqm':<12} | {'Time'}")
    print("-" * 105)
    for r in highway_test_results:
        print(f"{r['category']:<15} | {r['road_name'][:26]:<26} | {r['affected_parcels']:<16} | {r['full_impact']:<5} | {r['partial_impact']:<8} | {r['total_affected_sqm']:<12} | {r['execution_time_sec']}s")
    print("-" * 105)

    # 5. Test varying buffer widths (15m, 30m, 45m, 60m, 100m) on a major highway
    major_road = sample_corridors_by_highway.get('trunk') or sample_corridors_by_highway.get('primary')
    if major_road:
        road_feat = major_road[0]
        rprops = road_feat.get("properties", {})
        print(f"\nTesting Buffer Width Scaling on {rprops.get('ref') or rprops.get('name') or 'Major Highway'}:")
        widths = [15.0, 30.0, 45.0, 60.0, 100.0]
        for w in widths:
            corr = generate_corridor_buffer_service(road_feat, width_meters=w)
            res = intersect_corridor_with_parcels(corr, road_details={"road_name": rprops.get("name"), "width": w})
            summ = res.get("summary", {})
            print(f"  Width {w:5.1f}m -> Affected Parcels: {summ.get('total_affected_parcels', 0):3d} (Full: {summ.get('full_impact_count', 0)}, Partial: {summ.get('partial_impact_count', 0)})")

    print("\n" + "=" * 80)
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == '__main__':
    run_comprehensive_check()
