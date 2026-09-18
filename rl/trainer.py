"""
rl/trainer.py
=============
End-to-end Reinforcement Learning Trainer and Benchmark Evaluator.
Pairs the LIF Drosophila connectome reservoir with the Blackjack MDP.
"""

import time
from typing import Dict, Optional, Tuple
import numpy as np
import torch

from data.connectome_loader import ConnectomeData, ConnectomeLoader
from rl.blackjack_env import BlackjackEnv, BlackjackState, optimal_basic_strategy
from rl.linear_readout import ConnectomeQReadout
from rl.sensory_encoder import SensoryRateEncoder
from simulation.lif_engine import LIFConnectomeEngine


class ConnectomeRLAgent:
    def __init__(
        self,
        connectome_data: ConnectomeData,
        device: str = "cpu",
        checkpoint_path: str = "data/checkpoints/q_readout.pt",
    ):
        self.connectome = connectome_data
        self.device = device
        self.checkpoint_path = checkpoint_path

        # 1. LIF Simulation Engine
        self.lif_engine = LIFConnectomeEngine(
            num_neurons=connectome_data.num_neurons,
            weight_matrix=connectome_data.weight_matrix,
            sensory_indices=connectome_data.sensory_indices,
            descending_indices=connectome_data.descending_indices,
            device=device,
        )

        # 2. Sensory Rate Encoder
        self.encoder = SensoryRateEncoder(
            num_sensory_neurons=len(connectome_data.sensory_indices),
            device=device,
        )

        # 3. Descending Neuron Linear Readout
        self.readout = ConnectomeQReadout(
            num_descending_neurons=len(connectome_data.descending_indices),
            device=device,
        )

        # Load pre-existing checkpoint if present
        self.readout.load(checkpoint_path)

        # Reservoir state cache for accelerated training & instant responses
        self._state_feature_cache: Dict[Tuple[int, int, bool], torch.Tensor] = {}

    def get_features(
        self,
        state: BlackjackState,
        use_cache: bool = True,
        record_spikes: bool = False,
        sim_steps: int = 40,
    ) -> Tuple[torch.Tensor, Optional[list]]:
        """
        Processes a Blackjack state through the biological connectome LIF engine.
        Returns:
            dn_features: torch.Tensor of shape (num_dn,)
            active_events: Optional list of spiking neuron indices for 3D visualizer
        """
        state_key = (state.player_sum, state.dealer_card, state.usable_ace)
        if use_cache and not record_spikes and state_key in self._state_feature_cache:
            return self._state_feature_cache[state_key], None

        # Reset biological reservoir membrane potential
        self.lif_engine.reset_state()

        # Generate sensory Poisson spike train
        sensory_spikes = self.encoder.generate_poisson_spikes(state, duration_timesteps=sim_steps)

        # Simulate LIF dynamics
        dn_features, _, active_events = self.lif_engine.run_simulation(
            sensory_spikes,
            record_all_spikes=record_spikes,
        )

        if use_cache and not record_spikes:
            self._state_feature_cache[state_key] = dn_features.detach().clone()

        return dn_features, active_events

    def decide(
        self,
        state: BlackjackState,
        epsilon: float = 0.0,
        record_spikes: bool = False,
    ) -> Tuple[int, dict, Optional[list]]:
        """
        Given a Blackjack state, returns action (0=STAND, 1=HIT), Q-values, and telemetry.
        """
        features, active_events = self.get_features(state, use_cache=not record_spikes, record_spikes=record_spikes)
        action, q_values = self.readout.select_action(features, epsilon=epsilon)

        telemetry = {
            "action": "HIT" if action == BlackjackEnv.HIT else "STAND",
            "action_id": action,
            "q_stand": float(q_values[0].item()),
            "q_hit": float(q_values[1].item()),
            "confidence": float(torch.softmax(q_values, dim=-1)[action].item()),
            "state": {
                "player_sum": state.player_sum,
                "dealer_card": state.dealer_card,
                "usable_ace": state.usable_ace,
            }
        }
        return action, telemetry, active_events

    def train_online_episode(self, env: BlackjackEnv, epsilon: float = 0.1) -> Tuple[float, float]:
        """Plays one complete hand of Blackjack, updating Q-values via Bellman TD-error."""
        state = env.reset()
        done = False
        total_loss = 0.0
        steps = 0

        while not done:
            features, _ = self.get_features(state)
            action, _ = self.readout.select_action(features, epsilon=epsilon)

            next_state, reward, done, _ = env.step(action)

            if done:
                loss = self.readout.update_q(
                    dn_features=features,
                    action=action,
                    reward=reward,
                    next_dn_features=None,
                    done=True,
                )
            else:
                next_features, _ = self.get_features(next_state)
                loss = self.readout.update_q(
                    dn_features=features,
                    action=action,
                    reward=reward,
                    next_dn_features=next_features,
                    done=False,
                )
                state = next_state

            total_loss += loss
            steps += 1

        return reward, (total_loss / max(1, steps))

    def pretrain(self, num_episodes: int = 15000, eval_interval: int = 2500) -> dict:
        """
        Pretrains the readout layer across simulated Blackjack hands.
        """
        print(f"[Grav::RL] Initiating pretraining across {num_episodes} hands...")
        start_time = time.time()
        env = BlackjackEnv()

        rewards = []
        losses = []
        eval_history = []

        # Warm up the reservoir cache across common states
        print("[Grav::RL] Caching connectome reservoir dynamics across discrete states...")
        for p in range(4, 22):
            for d in range(1, 11):
                for a in [False, True]:
                    self.get_features(BlackjackState(p, d, a), use_cache=True, sim_steps=30)

        epsilon_start = 1.0
        epsilon_end = 0.05

        for ep in range(1, num_episodes + 1):
            eps = max(epsilon_end, epsilon_start - (ep / (num_episodes * 0.7)) * (epsilon_start - epsilon_end))
            r, loss = self.train_online_episode(env, epsilon=eps)
            rewards.append(r)
            losses.append(loss)

            if ep % eval_interval == 0:
                eval_stats = self.evaluate(num_eval_episodes=1000)
                eval_history.append({"episode": ep, **eval_stats})
                print(
                    f"[Grav::RL] Ep {ep:6d}/{num_episodes} | "
                    f"Win Rate: {eval_stats['win_rate']*100:.1f}% | "
                    f"Loss Rate: {eval_stats['loss_rate']*100:.1f}% | "
                    f"Mean Reward: {eval_stats['mean_reward']:.3f} | "
                    f"Basic Strategy Match: {eval_stats['policy_match_rate']*100:.1f}%"
                )

        self.readout.save(self.checkpoint_path)
        elapsed = time.time() - start_time
        print(f"[Grav::RL] Pretraining completed in {elapsed:.2f}s. Saved to {self.checkpoint_path}")

        return {
            "total_episodes": num_episodes,
            "training_time_seconds": elapsed,
            "final_eval": self.evaluate(num_eval_episodes=2000),
            "eval_history": eval_history,
        }

    def evaluate(self, num_eval_episodes: int = 1000) -> dict:
        """Evaluates the agent against optimal basic strategy and computes win/loss/push rates."""
        env = BlackjackEnv()
        wins = 0
        losses = 0
        pushes = 0
        total_reward = 0.0
        policy_matches = 0
        total_decisions = 0

        for _ in range(num_eval_episodes):
            state = env.reset()
            done = False

            while not done:
                action, _, _ = self.decide(state, epsilon=0.0)
                optimal_action = optimal_basic_strategy(state)
                if action == optimal_action:
                    policy_matches += 1
                total_decisions += 1

                state, reward, done, _ = env.step(action)

            total_reward += reward
            if reward > 0:
                wins += 1
            elif reward < 0:
                losses += 1
            else:
                pushes += 1

        return {
            "win_rate": wins / num_eval_episodes,
            "loss_rate": losses / num_eval_episodes,
            "push_rate": pushes / num_eval_episodes,
            "mean_reward": total_reward / num_eval_episodes,
            "policy_match_rate": (policy_matches / max(1, total_decisions)),
        }
