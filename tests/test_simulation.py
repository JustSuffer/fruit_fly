"""
tests/test_simulation.py
========================
Unit tests for Ant's Connectome Loader and LIF Simulation Engine.
"""

import os
import unittest
import numpy as np
import torch

from data.connectome_loader import ConnectomeLoader
from simulation.lif_engine import LIFConnectomeEngine


class TestConnectomeSimulation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loader = ConnectomeLoader(cache_dir="data/test_cache")
        cls.data = cls.loader.load_or_generate_reference(num_neurons=1000, synapses_per_neuron=15)

    def test_connectome_structure(self):
        self.assertEqual(self.data.num_neurons, 1000)
        self.assertGreater(self.data.num_synapses, 5000)
        self.assertTrue(self.data.weight_matrix.is_sparse)
        self.assertEqual(self.data.coordinates.shape, (1000, 3))
        self.assertGreater(len(self.data.sensory_indices), 50)
        self.assertGreater(len(self.data.descending_indices), 50)

    def test_lif_dynamics(self):
        engine = LIFConnectomeEngine(
            num_neurons=self.data.num_neurons,
            weight_matrix=self.data.weight_matrix,
            sensory_indices=self.data.sensory_indices,
            descending_indices=self.data.descending_indices,
            v_thresh=1.0,
            noise_std=0.0,
        )

        # 1. Quiescent test: with zero external input, no spikes should be emitted
        engine.reset_state()
        spikes = engine.step(external_current=None)
        self.assertEqual(float(spikes.sum().item()), 0.0)

        # 2. Driven test: inject strong current into sensory neurons
        ext_current = torch.zeros(self.data.num_neurons)
        ext_current[self.data.sensory_indices] = 2.5
        spikes = engine.step(external_current=ext_current)
        self.assertGreater(float(spikes.sum().item()), 0.0)

        # 3. Refractory test: neurons that spiked should have refractory counter set
        spiking_idx = torch.nonzero(spikes).squeeze(-1)
        for idx in spiking_idx[:10]:
            self.assertGreater(int(engine.refractory[idx].item()), 0)


if __name__ == "__main__":
    unittest.main()
