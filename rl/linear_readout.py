"""
rl/linear_readout.py
====================
Trainable Linear Q-Readout Layer attached to the Descending Neurons (motor outputs)
of the Drosophila connectome.

Since the biological connectome remains frozen as a rich dynamical reservoir,
learning optimal Blackjack decision-making reduces to training this lightweight
linear readout via temporal difference (Q-learning).
"""

import os
from typing import Optional, Tuple
import torch
import torch.nn as nn
import torch.optim as optim


class ConnectomeQReadout(nn.Module):
    def __init__(
        self,
        num_descending_neurons: int,
        num_actions: int = 2,  # 0: STAND, 1: HIT
        learning_rate: float = 0.005,
        device: str = "cpu",
    ):
        super().__init__()
        self.num_dn = num_descending_neurons
        self.num_actions = num_actions
        self.device = torch.device(device)

        # Linear readout mapping DN firing rates to Q(s, a)
        self.fc = nn.Linear(self.num_dn, self.num_actions)
        
        # Biologically motivated initialization: slight initial bias towards Hit on low totals
        nn.init.xavier_uniform_(self.fc.weight)
        nn.init.zeros_(self.fc.bias)

        self.to(self.device)
        self.optimizer = optim.AdamW(self.parameters(), lr=learning_rate, weight_decay=1e-4)
        self.loss_fn = nn.SmoothL1Loss()  # Huber loss for stable TD updates

    def forward(self, dn_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            dn_features: Tensor of shape (batch_size, num_dn) or (num_dn,)
        Returns:
            q_values: Tensor of shape (batch_size, 2) or (2,) [Q_stand, Q_hit]
        """
        if dn_features.dim() == 1:
            return self.fc(dn_features)
        return self.fc(dn_features)

    def select_action(self, dn_features: torch.Tensor, epsilon: float = 0.0) -> Tuple[int, torch.Tensor]:
        """
        Epsilon-greedy action selection.
        Returns:
            action (int: 0=STAND, 1=HIT)
            q_values (torch.Tensor of shape (2,))
        """
        with torch.no_grad():
            q_values = self.forward(dn_features.to(self.device))
            if torch.rand(1).item() < epsilon:
                action = int(torch.randint(0, self.num_actions, (1,)).item())
            else:
                action = int(torch.argmax(q_values).item())
            return action, q_values

    def update_q(
        self,
        dn_features: torch.Tensor,
        action: int,
        reward: float,
        next_dn_features: Optional[torch.Tensor],
        done: bool,
        gamma: float = 0.95,
    ) -> float:
        """
        Performs a 1-step Q-learning Bellman update.
        """
        self.train()
        self.optimizer.zero_grad()

        q_pred = self.forward(dn_features.to(self.device))
        current_q = q_pred[action]

        with torch.no_grad():
            if done or next_dn_features is None:
                target_q = torch.tensor(reward, dtype=torch.float32, device=self.device)
            else:
                next_q = self.forward(next_dn_features.to(self.device))
                target_q = reward + gamma * torch.max(next_q)

        loss = self.loss_fn(current_q, target_q)
        loss.backward()
        self.optimizer.step()

        return float(loss.item())

    def save(self, path: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save({
            "model_state": self.state_dict(),
            "optimizer_state": self.optimizer.state_dict(),
            "num_dn": self.num_dn,
        }, path)

    def load(self, path: str):
        if os.path.exists(path):
            checkpoint = torch.load(path, map_location=self.device)
            self.load_state_dict(checkpoint["model_state"])
            self.optimizer.load_state_dict(checkpoint["optimizer_state"])
            print(f"[Grav::RL] Loaded trained Q-readout checkpoint from {path}")
            return True
        return False
