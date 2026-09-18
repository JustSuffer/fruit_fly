"""
tests/test_rl.py
================
Unit tests for Grav's Blackjack MDP, Sensory Rate Encoder, and Linear Q-Readout.
"""

import unittest
import numpy as np
import torch

from rl.blackjack_env import BlackjackEnv, BlackjackState, optimal_basic_strategy
from rl.sensory_encoder import SensoryRateEncoder
from rl.linear_readout import ConnectomeQReadout


class TestBlackjackRL(unittest.TestCase):
    def test_blackjack_env_flow(self):
        env = BlackjackEnv()
        state = env.reset()
        self.assertGreaterEqual(state.player_sum, 4)
        self.assertLessEqual(state.player_sum, 21)
        self.assertGreaterEqual(state.dealer_card, 1)
        self.assertLessEqual(state.dealer_card, 10)

        # Test step
        next_state, reward, done, info = env.step(BlackjackEnv.STAND)
        self.assertTrue(done)
        self.assertIn(reward, [-1.0, 0.0, 1.0, 1.5])

    def test_basic_strategy_benchmark(self):
        # 16 vs 10 should HIT
        self.assertEqual(optimal_basic_strategy(BlackjackState(16, 10, False)), BlackjackEnv.HIT)
        # 20 vs 10 should STAND
        self.assertEqual(optimal_basic_strategy(BlackjackState(20, 10, False)), BlackjackEnv.STAND)
        # Soft 19 (usable ace) should STAND
        self.assertEqual(optimal_basic_strategy(BlackjackState(19, 7, True)), BlackjackEnv.STAND)

    def test_sensory_encoder(self):
        encoder = SensoryRateEncoder(num_sensory_neurons=100)
        state = BlackjackState(player_sum=18, dealer_card=6, usable_ace=False)
        rates = encoder.encode_state_to_rates(state)

        self.assertEqual(len(rates), 100)
        self.assertTrue((rates >= 20.0).all())
        self.assertTrue((rates <= 150.0).all())

        spikes = encoder.generate_poisson_spikes(state, duration_timesteps=30)
        self.assertEqual(spikes.shape, (30, 100))
        self.assertTrue(((spikes == 0.0) | (spikes == 1.0)).all())

    def test_q_readout(self):
        readout = ConnectomeQReadout(num_descending_neurons=120)
        dn_features = torch.rand(120)
        action, q_vals = readout.select_action(dn_features, epsilon=0.0)
        self.assertIn(action, [0, 1])
        self.assertEqual(q_vals.shape, (2,))

        # Update step
        loss = readout.update_q(
            dn_features=dn_features,
            action=action,
            reward=1.0,
            next_dn_features=None,
            done=True,
        )
        self.assertIsInstance(loss, float)
        self.assertGreaterEqual(loss, 0.0)


if __name__ == "__main__":
    unittest.main()
