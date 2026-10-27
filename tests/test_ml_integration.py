import os
import sys
import unittest
import json

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import app
from config import Config
from ml_service import load_priority_model, is_model_ready, predict_priority_single, predict_priority_batch


class TestMLIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_01_model_loading_and_readiness(self):
        """Verify the trained Random Forest model loads once and is marked ready."""
        model = load_priority_model()
        self.assertIsNotNone(model, "Priority model pipeline must load successfully.")
        self.assertTrue(is_model_ready(), "Model must report ready status.")
        
        # Verify cached singleton (loading only once)
        model_again = load_priority_model()
        self.assertIs(model, model_again, "Model must be cached singleton and not reloaded.")

    def test_02_health_endpoint_reports_ml_model(self):
        """Verify backend /api/health endpoint includes ML model status and metadata."""
        res = self.client.get('/api/health')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('ml_model_ready'), "Health check must report ml_model_ready as True")
        info = data.get('ml_model_info', {})
        self.assertEqual(info.get('target'), 'Priority')
        self.assertIn('Affected_Area_m2', info.get('features', []))
        self.assertIn('Affected_Percentage', info.get('features', []))
        self.assertIn('Impact_Type', info.get('features', []))

    def test_03_predict_priority_service_and_endpoint(self):
        """Verify priority prediction logic for single parcel and batch parcels."""
        # High impact scenario
        prio_high = predict_priority_single(3000.0, 92.0, "Full")
        self.assertEqual(prio_high, "High", "High area and high percentage should predict High priority.")

        # Low impact scenario
        prio_low = predict_priority_single(50.0, 3.0, "Partial")
        self.assertEqual(prio_low, "Low", "Small clipping area and percentage should predict Low priority.")

        # API endpoint single test
        res = self.client.post('/api/ml/predict-priority', json={
            "affected_area": 2500.0,
            "affected_percentage": 80.0,
            "impact_type": "Partial"
        })
        self.assertEqual(res.status_code, 200)
        self.assertIn(res.get_json().get('priority'), ["High", "Medium", "Low"])

    def test_04_corridor_intersection_workflow_with_ml_priority(self):
        """
        Verify end-to-end corridor intersection workflow:
        1. Select road 1 (NH275)
        2. Generate 30m buffer corridor
        3. Intersect corridor with cadastral parcels
        4. Confirm all affected parcels have predicted 'priority' ('High', 'Medium', 'Low')
        5. Confirm summary contains priority counts and preserved existing GIS logic.
        """
        # 1. Generate road corridor
        corridor_res = self.client.post('/api/roads/corridor', json={
            "road_id": 1,
            "width_meters": 30.0
        })
        self.assertEqual(corridor_res.status_code, 200)
        corridor = corridor_res.get_json()
        self.assertIsNotNone(corridor.get('geometry'))

        # 2. Perform spatial intersection
        inter_res = self.client.post('/api/corridor/intersect', json={
            "corridor": corridor,
            "impact_threshold": 90.0,
            "road_name": "NH275 Alignment",
            "road_ref": "NH275",
            "width_meters": 30.0
        })
        self.assertEqual(inter_res.status_code, 200)
        data = inter_res.get_json()

        summary = data.get('summary', {})
        parcels = data.get('parcels', [])

        self.assertGreater(len(parcels), 0, "Corridor must intersect affected parcels.")
        self.assertEqual(len(parcels), summary.get('total_affected_parcels'))

        # Verify preserved existing GIS logic
        self.assertIn('partial_impact_count', summary)
        self.assertIn('full_impact_count', summary)
        self.assertEqual(
            summary['partial_impact_count'] + summary['full_impact_count'],
            summary['total_affected_parcels'],
            "Partial + Full impact counts must equal total affected parcels"
        )

        # Verify ML priority integration
        self.assertIn('priority_breakdown', summary)
        self.assertIn('high_priority_count', summary)
        self.assertIn('medium_priority_count', summary)
        self.assertIn('low_priority_count', summary)
        
        sum_priorities = (
            summary['high_priority_count'] +
            summary['medium_priority_count'] +
            summary['low_priority_count']
        )
        self.assertEqual(sum_priorities, len(parcels), "Sum of priority counts must match total parcels.")

        valid_priorities = {'High', 'Medium', 'Low'}
        for p in parcels:
            self.assertIn('priority', p, f"Parcel {p.get('id')} must contain 'priority'")
            self.assertIn(p['priority'], valid_priorities)
            self.assertGreater(p['affected_area'], 0)
            self.assertGreater(p['total_area'], 0)
            self.assertGreaterEqual(p['affected_percentage'], 0)
            self.assertLessEqual(p['affected_percentage'], 100)
            self.assertIn(p['impact_type'], ['Partial Impact', 'Full Impact'])


if __name__ == '__main__':
    unittest.main()
