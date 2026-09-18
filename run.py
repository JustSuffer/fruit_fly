"""
run.py
======
Main launcher for the Drosophila Connectome Blackjack Platform.
Automates connectome verification, pre-training check, and starts the FastAPI/WebSocket server.
"""

import argparse
import os
import sys
import webbrowser
import uvicorn

from data.connectome_loader import ConnectomeLoader
from rl.trainer import ConnectomeRLAgent


def main():
    parser = argparse.ArgumentParser(description="Launch Drosophila Connectome Blackjack Platform")
    parser.add_argument("--host", default="127.0.0.1", help="Host IP")
    parser.add_argument("--port", type=int, default=8000, help="Port number")
    parser.add_argument("--pretrain-hands", type=int, default=5000, help="Offline pretraining hands if no checkpoint")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    print("=" * 70)
    print(" 🪰 DROSOPHILA CONNECTOME BLACKJACK | LIF RESERVOIR COMPUTING PLATFORM")
    print("=" * 70)

    # 1. Verify / generate connectome graph
    loader = ConnectomeLoader()
    connectome = loader.load_or_generate_reference(num_neurons=12000, synapses_per_neuron=30)
    print(f"[Ant::Simulation] Connectome active: {connectome.num_neurons:,} neurons, {connectome.num_synapses:,} synapses.")

    # 2. Check / pretrain Q-readout
    ckpt_path = "data/checkpoints/q_readout.pt"
    if not os.path.exists(ckpt_path) and args.pretrain_hands > 0:
        print(f"[Grav::RL] No checkpoint found. Running initial offline pre-training ({args.pretrain_hands} hands)...")
        agent = ConnectomeRLAgent(connectome, checkpoint_path=ckpt_path)
        agent.pretrain(num_episodes=args.pretrain_hands, eval_interval=1000)
    else:
        print(f"[Grav::RL] Checkpoint ready at {ckpt_path}")

    url = f"http://{args.host}:{args.port}"
    print(f"[Ty::UI] Serving interactive 3D WebGL dashboard at: {url}")
    print("=" * 70)

    if not args.no_browser:
        webbrowser.open(url)

    # Start FastAPI server
    uvicorn.run("server.app:app", host=args.host, port=args.port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
