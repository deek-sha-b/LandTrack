import os
import sys
import unittest
import json
import sqlite3

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import app
from config import Config
from gis_service import (
    get_roads_metadata, get_roads_geojson, get_road_by_id,
    generate_corridor_buffer_service, intersect_corridor_with_parcels
)

class TestRoadsIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.gpkg_path = Config.ROADS_FILE

    def test_01_gpkg_dataset_structure(self):
        """Verify the newly added road dataset exists and is a valid GeoPackage."""
        self.assertTrue(os.path.exists(self.gpkg_path), f"File {self.gpkg_path} must exist")
        self.assertTrue(self.gpkg_path.endswith('.gpkg'), "New dataset must be GeoPackage (.gpkg)")
        
        conn = sqlite3.connect(self.gpkg_path)
        c = conn.cursor()
        c.execute("SELECT table_name, data_type, srs_id FROM gpkg_contents WHERE data_type = 'features'")
        contents = c.fetchall()
        self.assertGreater(len(contents), 0, "GPKG must contain feature layer")
        table_name = contents[0][0]
        self.assertEqual(table_name, 'puttur road')
        self.assertEqual(contents[0][2], 4326, "CRS must be EPSG:4326")

        c.execute(f"SELECT COUNT(*) FROM \"{table_name}\"")
        count = c.fetchone()[0]
        self.assertEqual(count, 1050, "New road dataset must contain 1050 features")
        conn.close()

    def test_02_roads_metadata_api(self):
        """Verify roads metadata endpoint reflects the new dataset."""
        res = self.client.get('/api/roads/metadata')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('putturroadfinal.gpkg', data.get('file_name', ''))
        self.assertEqual(data.get('crs'), 'EPSG:4326 (WGS 84)')
        self.assertEqual(data.get('projected_crs'), 'EPSG:32643 (UTM Zone 43N, Karnataka)')
        self.assertEqual(data.get('geometry_type'), 'MultiLineString')
        self.assertEqual(data.get('number_of_features'), 1050)
        self.assertAlmostEqual(data.get('total_network_length_km'), 642.54, delta=5.0)

    def test_03_road_attributes_preserved(self):
        """Verify road attributes are preserved without inventing missing values."""
        res = self.client.get('/api/roads/1')
        self.assertEqual(res.status_code, 200)
        feat = res.get_json()
        props = feat.get('properties', {})
        self.assertEqual(props.get('ref'), 'NH275')
        self.assertEqual(props.get('highway'), 'trunk')
        self.assertIn('length_km', props)
        self.assertGreater(props.get('length_m'), 0)

    def test_04_corridor_buffer_generation(self):
        """Verify metric buffer generation in projected CRS EPSG:32643."""
        res = self.client.post('/api/roads/corridor', json={
            "road_id": 1,
            "width_meters": 30.0
        })
        self.assertEqual(res.status_code, 200)
        corridor = res.get_json()
        self.assertEqual(corridor.get('type'), 'Feature')
        geom = corridor.get('geometry', {})
        self.assertIn(geom.get('type'), ['Polygon', 'MultiPolygon'])
        self.assertEqual(corridor.get('properties', {}).get('width_meters'), 30.0)

    def test_05_corridor_intersection_with_parcels(self):
        """Verify spatial intersection calculates area, percentage, and impact types."""
        # 1. Generate corridor
        buf_res = self.client.post('/api/roads/corridor', json={"road_id": 1, "width_meters": 30.0})
        corridor = buf_res.get_json()

        # 2. Intersect with cadastral parcels
        res = self.client.post('/api/corridor/intersect', json={
            "corridor": corridor,
            "impact_threshold": 90.0,
            "road_name": "NH275 Alignment",
            "road_ref": "NH275",
            "width_meters": 30.0
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        summary = data.get('summary', {})
        parcels = data.get('parcels', [])

        self.assertGreater(summary.get('total_affected_parcels', 0), 0)
        self.assertEqual(len(parcels), summary.get('total_affected_parcels'))

        # Check deduplication
        seen_fids = set()
        for p in parcels:
            self.assertNotIn(p['id'], seen_fids, f"Duplicate parcel FID {p['id']} found")
            seen_fids.add(p['id'])

            # Area calculations
            self.assertGreater(p['total_area'], 0)
            self.assertGreater(p['affected_area'], 0)
            self.assertLessEqual(p['affected_percentage'], 100.0)
            self.assertIn(p['impact_type'], ['Partial Impact', 'Full Impact'])

            # Traceability identifiers
            self.assertIsNotNone(p.get('parcel_id'))
            self.assertIsNotNone(p.get('survey_number'))
            self.assertIsNotNone(p.get('village'))

if __name__ == '__main__':
    unittest.main()
