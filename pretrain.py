"""
pretrain.py
===========
CLI tool to run deep reinforcement learning pre-training on the Drosophila
connectome reservoir across arbitrary numbers of hands (e.g. 50,000 hands).
"""

import argparse
from data.connectome_loader import ConnectomeLoader
from rl.trainer import ConnectomeRLAgent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hands", type=int, default=20000, help="Number of Blackjack hands to simulate")
    parser.add_argument("--eval-interval", type=int, default=2500, help="Hands between evaluations")
    parser.add_argument("--checkpoint", default="data/checkpoints/q_readout.pt", help="Path to save weights")
    args = parser.parse_args()

    loader = ConnectomeLoader()
    connectome = loader.load_or_generate_reference(num_neurons=12000, synapses_per_neuron=30)
    agent = ConnectomeRLAgent(connectome, checkpoint_path=args.checkpoint)

    stats = agent.pretrain(num_episodes=args.hands, eval_interval=args.eval_interval)
    print("\n[Final Benchmark Results]")
    print(f"Win Rate:  {stats['final_eval']['win_rate']*100:.2f}%")
    print(f"Loss Rate: {stats['final_eval']['loss_rate']*100:.2f}%")
    print(f"Push Rate: {stats['final_eval']['push_rate']*100:.2f}%")
    print(f"Basic Strategy Agreement: {stats['final_eval']['policy_match_rate']*100:.2f}%")


if __name__ == "__main__":
    main()
