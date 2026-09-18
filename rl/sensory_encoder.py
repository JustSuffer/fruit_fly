"""
rl/sensory_encoder.py
=====================
Transforms Blackjack discrete game state into biological sensory spike trains (20-150 Hz)
via Gaussian receptive field population rate coding.
"""

from typing import Tuple
import numpy as np
import torch
from rl.blackjack_env import BlackjackState


class SensoryRateEncoder:
    def __init__(
        self,
        num_sensory_neurons: int = 150,
        dt_ms: float = 1.0,
        min_rate_hz: float = 20.0,
        max_rate_hz: float = 150.0,
        device: str = "cpu",
    ):
        self.num_sensory = num_sensory_neurons
        self.dt_ms = dt_ms
        self.min_rate = min_rate_hz
        self.max_rate = max_rate_hz
        self.device = device

        # Allocate subpopulations for state features:
        # 50% for Player Sum (4 to 21)
        # 30% for Dealer Upcard (1 to 10)
        # 20% for Usable Ace (binary)
        self.n_player = int(self.num_sensory * 0.50)
        self.n_dealer = int(self.num_sensory * 0.30)
        self.n_ace = self.num_sensory - (self.n_player + self.n_dealer)

        # Centers and bandwidths for Gaussian tuning curves
        self.player_centers = np.linspace(4.0, 21.0, self.n_player)
        self.player_sigma = (21.0 - 4.0) / (self.n_player * 0.8)

        self.dealer_centers = np.linspace(1.0, 10.0, self.n_dealer)
        self.dealer_sigma = (10.0 - 1.0) / (self.n_dealer * 0.8)

    def encode_state_to_rates(self, state: BlackjackState) -> np.ndarray:
        """
        Maps (player_sum, dealer_card, usable_ace) to instantaneous firing rates (Hz).
        Returns array of shape (num_sensory,).
        """
        rates = np.full(self.num_sensory, self.min_rate, dtype=np.float32)

        # 1. Player Sum Receptive Fields
        player_act = np.exp(-0.5 * ((state.player_sum - self.player_centers) / self.player_sigma) ** 2)
        rates[:self.n_player] += player_act * (self.max_rate - self.min_rate)

        # 2. Dealer Upcard Receptive Fields
        dealer_act = np.exp(-0.5 * ((state.dealer_card - self.dealer_centers) / self.dealer_sigma) ** 2)
        rates[self.n_player : self.n_player + self.n_dealer] += dealer_act * (self.max_rate - self.min_rate)

        # 3. Usable Ace Subpopulation
        if state.usable_ace:
            rates[self.n_player + self.n_dealer :] = self.max_rate
        else:
            rates[self.n_player + self.n_dealer :] = self.min_rate

        return np.clip(rates, self.min_rate, self.max_rate)

    def generate_poisson_spikes(
        self,
        state: BlackjackState,
        duration_timesteps: int = 40,
    ) -> torch.Tensor:
        """
        Generates binary Poisson spike trains for the sensory afferents over T timesteps.
        
        Returns:
            torch.Tensor of shape (duration_timesteps, num_sensory)
        """
        rates_hz = self.encode_state_to_rates(state)
        # Spike probability per dt timestep: P = rate_hz * (dt / 1000)
        spike_prob = rates_hz * (self.dt_ms / 1000.0)

        # Vectorized Bernoulli / Poisson sampling
        rand_matrix = np.random.rand(duration_timesteps, self.num_sensory)
        spikes = (rand_matrix < spike_prob[np.newaxis, :]).astype(np.float32)

        return torch.tensor(spikes, dtype=torch.float32, device=self.device)
