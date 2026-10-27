"""
Basic unit tests for LandTrack backend setup.
"""
import sys
import os
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app import app
from config import Config

class TestLandTrackSetup(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_endpoint(self):
        """Verify that health check endpoint returns 200 and project metadata."""
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get('service'), 'LandTrack')
        self.assertEqual(data.get('study_area'), 'Puttur, Karnataka, India')
        self.assertIn('database', data)

    def test_status_endpoint(self):
        """Verify that system status endpoint returns directory readiness."""
        response = self.client.get('/api/status')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn('directories', data)

if __name__ == '__main__':
    unittest.main()
