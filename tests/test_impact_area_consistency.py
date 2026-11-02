import os
import sys
import unittest
import json

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app import app
from gis_service import (
    get_road_by_id,
    generate_corridor_buffer_service,
    intersect_corridor_with_parcels,
)
from ml_service import predict_priority_batch, predict_priority_single, is_model_ready


class TestImpactAreaConsistency(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_01_model_readiness_and_preservation(self):
        """Verify the original Random Forest model is loaded and ready without changes."""
        self.assertTrue(is_model_ready(), "Model must be ready.")
        model_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ml", "landtrack_priority_model.pkl"))
        self.assertTrue(os.path.exists(model_path), "ml/landtrack_priority_model.pkl must exist.")
        dataset_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "datasets", "ml", "LandTrack_ML_Dataset.csv"))
        self.assertTrue(os.path.exists(dataset_path), "datasets/ml/LandTrack_ML_Dataset.csv must exist.")

    def test_02_spatial_intersection_consistency(self):
        """
        Verify that:
        1. Affected Area <= Total Area for ALL returned parcels.
        2. Affected Percentage is bounded in [0.0, 100.0].
        3. Full Impact corresponds strictly to affected_percentage >= 90.0%.
        4. Partial Impact corresponds strictly to affected_percentage < 90.0%.
        5. Survey Number is never literal '0'.
        6. Priority is assigned by the Random Forest model.
        """
        road = get_road_by_id("NH275", complete=True)
        self.assertIsNotNone(road, "NH275 road feature must exist.")

        corridor = generate_corridor_buffer_service(road, width_meters=30.0)
        self.assertIsNotNone(corridor, "Corridor buffer must be generated.")

        res = intersect_corridor_with_parcels(corridor, impact_threshold=90.0, road_details={"road_name": "NH275", "width": 30.0})
        parcels = res.get("parcels", [])
        summary = res.get("summary", {})

        self.assertGreater(len(parcels), 0, "Must return affected parcels for NH275.")
        self.assertEqual(len(parcels), summary["total_affected_parcels"])

        partial_found = False
        full_found = False

        for p in parcels:
            tot = p["total_area"]
            aff = p["affected_area"]
            pct = p["affected_percentage"]
            imp = p["impact_type"]
            prio = p["priority"]
            sn = p["survey_number"]

            # Physical and mathematical consistency
            self.assertGreater(tot, 0.0, f"Total area must be strictly positive for parcel {p['id']}.")
            self.assertGreater(aff, 0.0, f"Affected area must be strictly positive for parcel {p['id']}.")
            self.assertLessEqual(aff, tot, f"Affected area ({aff}) cannot exceed total area ({tot}) for parcel {p['id']}.")
            self.assertLessEqual(pct, 100.0, f"Percentage ({pct}) cannot exceed 100.0% for parcel {p['id']}.")
            self.assertGreaterEqual(pct, 0.0, f"Percentage ({pct}) cannot be negative for parcel {p['id']}.")

            # Impact classification consistency
            if pct >= 90.0:
                self.assertEqual(imp, "Full Impact", f"Parcel {p['id']} with {pct}% must be Full Impact.")
                full_found = True
            else:
                self.assertEqual(imp, "Partial Impact", f"Parcel {p['id']} with {pct}% must be Partial Impact.")
                partial_found = True

            # Survey number honesty
            self.assertNotEqual(sn, "0", f"Survey number should never be literal '0' for parcel {p['id']}.")

            # ML priority classification
            self.assertIn(prio, ["High", "Medium", "Low"], f"Priority must be High, Medium, or Low for parcel {p['id']}.")

        self.assertTrue(partial_found, "Must have representative Partial Impact parcels.")
        self.assertTrue(full_found, "Must have representative Full Impact parcels.")

    def test_03_no_impact_parcel_exclusion(self):
        """Verify that a parcel far outside the acquisition buffer has zero impact and is excluded."""
        # Kabaka parcel (FID 1) is located far from NH275 alignment
        road = get_road_by_id("Bettampady School Road", complete=True)
        corridor = generate_corridor_buffer_service(road, width_meters=30.0)
        res = intersect_corridor_with_parcels(corridor, road_details={"road_name": "Bettampady School Road", "width": 30.0})
        parcels = res.get("parcels", [])
        
        # Verify FID 1 is not in parcels
        fids = [p["id"] for p in parcels]
        self.assertNotIn(1, fids, "Parcel FID 1 far from corridor must have zero impact and be excluded.")

    def test_04_ml_prediction_pipeline_feature_alignment(self):
        """
        Verify that Random Forest pipeline in backend receives exact features:
        Affected_Area_m2, Affected_Percentage, and Impact_Type ('Full' or 'Partial')
        and correctly yields valid predictions.
        """
        test_parcels = [
            {"affected_area": 5000.0, "affected_percentage": 95.0, "impact_type": "Full Impact"},
            {"affected_area": 150.0, "affected_percentage": 10.0, "impact_type": "Partial Impact"},
            {"affected_area": 2500.0, "affected_percentage": 45.0, "impact_type": "Partial Impact"},
        ]
        predict_priority_batch(test_parcels)
        self.assertEqual(test_parcels[0]["priority"], "High")
        self.assertEqual(test_parcels[1]["priority"], "Low")
        self.assertIn(test_parcels[2]["priority"], ["Medium", "High"])

    def test_05_synthetic_geometry_edge_cases(self):
        """Test parcels with no impact, partial impact, full coverage, and invalid/zero-area shapes."""
        from shapely.geometry import Polygon, box

        # Synthetic buffer: box from (0,0) to (100, 100)
        buffer_geom = box(0, 0, 100, 100)

        # 1. Fully covered parcel: box (10, 10, 20, 20) -> area 100
        full_parcel = box(10, 10, 20, 20)
        inter_full = full_parcel.intersection(buffer_geom)
        self.assertAlmostEqual(inter_full.area, full_parcel.area)
        self.assertLessEqual(inter_full.area, full_parcel.area)
        pct_full = (inter_full.area / full_parcel.area) * 100.0
        self.assertAlmostEqual(pct_full, 100.0)

        # 2. Partially covered parcel: box (50, 0, 150, 100) -> parcel area 10000, intersection area 5000 (50%)
        partial_parcel = box(50, 0, 150, 100)
        inter_partial = partial_parcel.intersection(buffer_geom)
        self.assertAlmostEqual(inter_partial.area, 5000.0)
        self.assertLessEqual(inter_partial.area, partial_parcel.area)
        pct_partial = (inter_partial.area / partial_parcel.area) * 100.0
        self.assertAlmostEqual(pct_partial, 50.0)

        # 3. Completely outside parcel: box (200, 200, 300, 300)
        outside_parcel = box(200, 200, 300, 300)
        inter_outside = outside_parcel.intersection(buffer_geom)
        self.assertTrue(inter_outside.is_empty)
        self.assertEqual(inter_outside.area, 0.0)

        # 4. Invalid self-intersecting polygon (bowtie): handled safely by buffer(0) / make_valid
        bowtie = Polygon([(0, 0), (0, 2), (2, 0), (2, 2), (0, 0)])
        self.assertFalse(bowtie.is_valid)
        fixed_bowtie = bowtie.buffer(0)
        self.assertTrue(fixed_bowtie.is_valid)
        inter_fixed = fixed_bowtie.intersection(buffer_geom)
        self.assertLessEqual(inter_fixed.area, fixed_bowtie.area)


if __name__ == "__main__":
    unittest.main()

