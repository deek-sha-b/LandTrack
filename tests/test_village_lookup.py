"""
Unit tests for Cadastral Parcel Village Name Lookup (Puttur_Village_Code_Name_Lookup_Complete.csv)
"""
import sys
import os
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import app
from gis_service import lookup_village_name, get_village_lookup

class TestVillageNameLookup(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_lookup_direct_functions(self):
        """Test lookup_village_name function with known codes, Putturu, and fallbacks."""
        # 1. Example from prompt: 617686 -> Kabaka (Rural)
        self.assertEqual(lookup_village_name(617686), "Kabaka (Rural)")
        self.assertEqual(lookup_village_name("617686"), "Kabaka (Rural)")

        # 2. Example from prompt: 938816 -> Putturu
        self.assertEqual(lookup_village_name(938816), "Putturu")
        self.assertEqual(lookup_village_name("938816"), "Putturu")

        # 3. Other known villages in Puttur Taluk
        self.assertEqual(lookup_village_name(617687), "Kudipadi")
        self.assertEqual(lookup_village_name(617688), "Padnoor (Rural)")
        self.assertEqual(lookup_village_name(617689), "Bannur (Rural)")
        self.assertEqual(lookup_village_name(617742), "Panaje")
        self.assertEqual(lookup_village_name(617705), "Koila")
        self.assertEqual(lookup_village_name(617731), "Balnadu (Rural)")

        # 4. Unknown / unmatched code -> 'Not Available'
        self.assertEqual(lookup_village_name(999999), "Not Available")
        self.assertEqual(lookup_village_name("999999"), "Not Available")
        self.assertEqual(lookup_village_name("INVALID_CODE"), "Not Available")

        # 5. Missing / None / empty code -> 'Not Available'
        self.assertEqual(lookup_village_name(None), "Not Available")
        self.assertEqual(lookup_village_name(""), "Not Available")
        self.assertEqual(lookup_village_name("None"), "Not Available")

    def test_villages_endpoint(self):
        """Test /api/cadastral/villages endpoint returns 67 lookup entries."""
        response = self.client.get('/api/cadastral/villages')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertGreaterEqual(data.get("total_villages"), 67)
        lookup = data.get("lookup", {})
        self.assertEqual(lookup.get("617686"), "Kabaka (Rural)")
        self.assertEqual(lookup.get("938816"), "Putturu")
        self.assertEqual(lookup.get("617687"), "Kudipadi")

    def test_parcels_endpoint_with_village_names(self):
        """Test that parcel GeoJSON features contain matched Village_Name."""
        # Test code 617686 (Kabaka (Rural))
        res1 = self.client.get('/api/cadastral/parcels?village_code=617686&limit=2')
        self.assertEqual(res1.status_code, 200)
        feats1 = res1.get_json().get("features", [])
        self.assertGreater(len(feats1), 0)
        for f in feats1:
            props = f["properties"]
            self.assertEqual(str(props["lgd_village_code"]), "617686")
            self.assertEqual(props["village"], "Kabaka (Rural)")

        # Test code 938816 (Putturu)
        res2 = self.client.get('/api/cadastral/parcels?village_code=938816&limit=2')
        self.assertEqual(res2.status_code, 200)
        feats2 = res2.get_json().get("features", [])
        self.assertGreater(len(feats2), 0)
        for f in feats2:
            props = f["properties"]
            self.assertEqual(str(props["lgd_village_code"]), "938816")
            self.assertEqual(props["village"], "Putturu")

        # Test code 617687 (Kudipadi)
        res3 = self.client.get('/api/cadastral/parcels?village_code=617687&limit=2')
        self.assertEqual(res3.status_code, 200)
        feats3 = res3.get_json().get("features", [])
        self.assertGreater(len(feats3), 0)
        for f in feats3:
            props = f["properties"]
            self.assertEqual(str(props["lgd_village_code"]), "617687")
            self.assertEqual(props["village"], "Kudipadi")

    def test_parcel_detail_endpoint(self):
        """Test single parcel detail endpoint has village name matching its LGD_VillageCode."""
        # In new full Puttur dataset, FID 1 has LGD_VillageCode 617695 (Bajathuru)
        res = self.client.get('/api/cadastral/parcels/1')
        self.assertEqual(res.status_code, 200)
        props = res.get_json().get("properties", {})
        self.assertEqual(props.get("lgd_village_code"), 617695)
        self.assertEqual(props.get("village"), "Bajathuru")

if __name__ == '__main__':
    unittest.main()
