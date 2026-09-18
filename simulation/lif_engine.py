"""
simulation/lif_engine.py
========================
High-performance PyTorch Vectorized Leaky Integrate-and-Fire (LIF) Simulation Engine
using Sparse Matrix Multiplications.

The biological connectome weight matrix W remains completely frozen, acting as a
high-dimensional recurrent biological reservoir.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import torch


class LIFConnectomeEngine:
    def __init__(
        self,
        num_neurons: int,
        weight_matrix: torch.Tensor,
        sensory_indices: np.ndarray,
        descending_indices: np.ndarray,
        dt: float = 1.0,           # Simulation timestep (ms)
        tau_m: float = 10.0,       # Membrane time constant (ms)
        v_thresh: float = 1.0,     # Normalized firing threshold
        v_reset: float = 0.0,      # Reset potential
        refractory_period: int = 2, # Refractory timesteps
        noise_std: float = 0.05,   # Membrane voltage stochastic noise
        device: Optional[str] = None,
    ):
        self.num_neurons = num_neurons
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        
        # Ensure weight matrix is sparse on target device
        if not weight_matrix.is_sparse:
            self.W = weight_matrix.to_sparse().to(self.device)
        else:
            self.W = weight_matrix.to(self.device)
        
        # Freeze biological weights: no gradients
        self.W.requires_grad_(False)

        self.sensory_indices = torch.tensor(sensory_indices, dtype=torch.long, device=self.device)
        self.descending_indices = torch.tensor(descending_indices, dtype=torch.long, device=self.device)

        self.dt = dt
        self.tau_m = tau_m
        self.decay = float(np.exp(-dt / tau_m))
        self.v_thresh = v_thresh
        self.v_reset = v_reset
        self.refractory_period = refractory_period
        self.noise_std = noise_std

        # State tensors
        self.V = torch.zeros(self.num_neurons, device=self.device, dtype=torch.float32)
        self.refractory = torch.zeros(self.num_neurons, device=self.device, dtype=torch.int32)
        self.last_spikes = torch.zeros(self.num_neurons, device=self.device, dtype=torch.float32)

    def reset_state(self):
        """Resets membrane potentials and refractory timers to baseline."""
        self.V.zero_()
        self.refractory.zero_()
        self.last_spikes.zero_()

    def step(self, external_current: Optional[torch.Tensor] = None) -> torch.Tensor:
        """
        Advances the connectome LIF simulation by one timestep (dt ms).
        
        Returns:
            spikes: Tensor of shape (num_neurons,) with 1.0 for firing neurons, 0.0 otherwise.
        """
        with torch.no_grad():
            # 1. Synaptic current from previous step spikes: W * S_{t-1}
            # Reshape last_spikes to (N, 1) for sparse matrix-vector multiplication
            s_prev = self.last_spikes.unsqueeze(1)
            # torch.sparse.mm computes W (N, N) @ s_prev (N, 1) -> (N, 1)
            i_syn = torch.sparse.mm(self.W, s_prev).squeeze(1)

            # 2. Inject external current (e.g. from sensory Poisson spikes)
            if external_current is not None:
                i_syn = i_syn + external_current

            # 3. Add biological membrane voltage noise
            if self.noise_std > 0.0:
                noise = torch.randn_like(self.V) * self.noise_std
            else:
                noise = 0.0

            # 4. Membrane integration for neurons NOT in refractory period
            non_refractory = (self.refractory == 0)
            self.V = torch.where(
                non_refractory,
                self.V * self.decay + i_syn + noise,
                self.v_reset
            )

            # 5. Threshold crossing & spike generation
            spikes = (self.V >= self.v_thresh).float()

            # 6. Reset spiking neurons & set refractory period
            spiking_mask = spikes > 0.0
            self.V[spiking_mask] = self.v_reset
            self.refractory[spiking_mask] = self.refractory_period
            
            # Decrement refractory counter for others
            self.refractory[self.refractory > 0] -= 1

            self.last_spikes = spikes
            return spikes

    def run_simulation(
        self,
        sensory_spike_train: torch.Tensor,
        record_all_spikes: bool = False,
    ) -> Tuple[torch.Tensor, torch.Tensor, List[List[int]]]:
        """
        Runs the simulation across a temporal window of T timesteps.

        Args:
            sensory_spike_train: Tensor of shape (T, num_sensory_neurons) containing
                                 binary spikes or currents for input channels.
            record_all_spikes: Whether to record active neuron indices per step for 3D visualization.

        Returns:
            dn_features: Accumulated or mean spike rate of Descending Neurons (shape: num_descending)
            total_spikes: Total spikes per neuron across the window (shape: num_neurons)
            active_events: List of active neuron index lists per timestep (for WebGL telemetry)
        """
        T = sensory_spike_train.shape[0]
        dn_spikes_accum = torch.zeros(len(self.descending_indices), device=self.device)
        total_spikes = torch.zeros(self.num_neurons, device=self.device)
        active_events = []

        for t in range(T):
            # Form external current vector for this timestep
            ext_current = torch.zeros(self.num_neurons, device=self.device)
            # Inject sensory input spikes with standard biological synaptic weight
            ext_current[self.sensory_indices] = sensory_spike_train[t] * 1.8

            spikes = self.step(ext_current)
            total_spikes += spikes

            # Accumulate descending neuron activity
            dn_spikes_accum += spikes[self.descending_indices]

            if record_all_spikes:
                # Downsample/record active indices for 3D visualization
                active_idx = torch.nonzero(spikes).squeeze(-1).cpu().tolist()
                active_events.append(active_idx)

        # Normalize DN features by duration (mean firing rate in kHz)
        dn_features = dn_spikes_accum / float(T)
        return dn_features, total_spikes, active_events
