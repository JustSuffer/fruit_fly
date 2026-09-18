"""
export_vercel_bundle.py
=======================
Ultra-fast packager for Vercel Serverless deployment.
Exports downsampled 3D coordinates, neuropil labels, and Q-values for all 360 states.
"""

import json
import os
import time
import numpy as np

from data.connectome_loader import ConnectomeLoader
from rl.trainer import ConnectomeRLAgent
from rl.blackjack_env import BlackjackState, optimal_basic_strategy


def export_bundle():
    print("[Vercel Packager] Generating lightweight Vercel deployment bundle...", flush=True)
    os.makedirs("api", exist_ok=True)
    start_t = time.time()

    # 1. Load connectome & agent
    loader = ConnectomeLoader()
    connectome = loader.load_or_generate_reference(num_neurons=12000, synapses_per_neuron=30)
    agent = ConnectomeRLAgent(connectome, checkpoint_path="data/checkpoints/q_readout.pt")

    # 2. Downsample 3D coordinates (~4,000 neurons for snappy mobile/browser WebGL)
    n_pts = min(4000, len(connectome.coordinates))
    sample_indices = np.linspace(0, len(connectome.coordinates) - 1, n_pts, dtype=int)
    coords_sampled = connectome.coordinates[sample_indices].round(1).tolist()

    idx_to_sample = {int(orig): i for i, orig in enumerate(sample_indices)}

    neuropil_map = {}
    for name, idxs in connectome.neuropil_labels.items():
        neuropil_map[name] = [idx_to_sample[int(i)] for i in idxs if int(i) in idx_to_sample]

    # 3. Precompute decisions across all 360 discrete states using cached reservoir features
    states_dict = {}
    for p in range(4, 22):
        for d in range(1, 11):
            for a in [False, True]:
                state = BlackjackState(p, d, a)
                action_id, telemetry, _ = agent.decide(state, record_spikes=False, epsilon=0.0)
                optimal_act = optimal_basic_strategy(state)

                key = f"{p}_{d}_{int(a)}"
                states_dict[key] = {
                    "action": telemetry["action"],
                    "action_id": action_id,
                    "optimal": "HIT" if optimal_act == 1 else "STAND",
                    "q_stand": round(telemetry["q_stand"], 4),
                    "q_hit": round(telemetry["q_hit"], 4),
                    "confidence": round(telemetry["confidence"], 4),
                }

    bundle = {
        "num_neurons": connectome.num_neurons,
        "num_synapses": connectome.num_synapses,
        "coordinates": coords_sampled,
        "neuropil_labels": neuropil_map,
        "states": states_dict,
    }

    out_path = "api/bundle.json"
    with open(out_path, "w") as f:
        json.dump(bundle, f)

    size_kb = os.path.getsize(out_path) / 1024
    elapsed = time.time() - start_t
    print(f"[Vercel Packager] SUCCESS: Exported bundle to {out_path} ({size_kb:.1f} KB in {elapsed:.2f}s)", flush=True)


if __name__ == "__main__":
    export_bundle()
