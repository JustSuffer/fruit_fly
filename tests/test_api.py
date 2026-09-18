"""
tests/test_api.py
=================
Integration tests for FastAPI REST endpoints.
"""

import unittest
from fastapi.testclient import TestClient
from server.app import app


class TestAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_metadata_endpoint(self):
        res = self.client.get("/api/connectome/metadata")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("num_neurons", data)
        self.assertIn("num_synapses", data)
        self.assertIn("coordinates", data)
        self.assertIn("neuropil_labels", data)

    def test_new_game_and_step(self):
        # 1. New game
        res = self.client.post("/api/game/new")
        self.assertEqual(res.status_code, 200)
        game = res.json()
        self.assertIn("player_cards", game)
        self.assertIn("dealer_cards", game)
        self.assertIn("recommended_action", game)
        self.assertIn(game["recommended_action"], ["HIT", "STAND"])

        # 2. Step
        step_res = self.client.post("/api/game/step", json={"action": "STAND"})
        self.assertEqual(step_res.status_code, 200)
        step_data = step_res.json()
        self.assertTrue(step_data["done"])
        self.assertIn("reward", step_data)


if __name__ == "__main__":
    unittest.main()
