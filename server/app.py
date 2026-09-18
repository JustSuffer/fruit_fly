"""
server/app.py
=============
FastAPI Microservice & WebSocket Telemetry Server for the Fruit Fly Connectome
Blackjack Platform.
"""

import asyncio
import json
import os
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from data.connectome_loader import ConnectomeLoader
from rl.blackjack_env import BlackjackEnv, BlackjackState, optimal_basic_strategy
from rl.trainer import ConnectomeRLAgent


app = FastAPI(
    title="Drosophila Connectome Blackjack RL Platform",
    description="Full-stack biologically simulated fruit fly connectome playing Blackjack via LIF reservoir dynamics.",
    version="1.0.0",
)

# Enable CORS for local web development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
LOADER = ConnectomeLoader()
CONNECTOME_DATA = None
AGENT = None
GAME_ENV = BlackjackEnv()
CURRENT_STATE: Optional[BlackjackState] = None


def get_agent() -> ConnectomeRLAgent:
    global CONNECTOME_DATA, AGENT
    if AGENT is None:
        print("[Server] Initializing Connectome and Agent...")
        CONNECTOME_DATA = LOADER.load_or_generate_reference(num_neurons=12000, synapses_per_neuron=30)
        AGENT = ConnectomeRLAgent(CONNECTOME_DATA, checkpoint_path="data/checkpoints/q_readout.pt")
    return AGENT


class StepRequest(BaseModel):
    action: Optional[str] = None  # "HIT", "STAND", or None for AI auto-decision


class TrainRequest(BaseModel):
    num_hands: int = 500


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass


ws_manager = ConnectionManager()


@app.on_event("startup")
async def startup_event():
    # Warm up agent on startup in background
    get_agent()


@app.get("/api/connectome/metadata")
async def get_connectome_metadata():
    """Returns spatial coordinates and anatomical neuropil cluster indices for 3D WebGL visualization."""
    agent = get_agent()
    data = agent.connectome
    
    # Downsample points for ultra-smooth 60 FPS WebGL rendering (top 6,000 landmark neurons)
    coords = data.coordinates.tolist()
    
    neuropil_summary = {}
    for name, indices in data.neuropil_labels.items():
        neuropil_summary[name] = {
            "count": len(indices),
            "sample_indices": indices[:50].tolist(),
        }

    return {
        "num_neurons": data.num_neurons,
        "num_synapses": data.num_synapses,
        "coordinates": coords,
        "neuropil_labels": {k: v.tolist() for k, v in data.neuropil_labels.items()},
        "sensory_indices": data.sensory_indices.tolist(),
        "descending_indices": data.descending_indices.tolist(),
    }


@app.post("/api/game/new")
async def new_game():
    """Starts a new hand of Blackjack."""
    global CURRENT_STATE
    agent = get_agent()
    CURRENT_STATE = GAME_ENV.reset()

    # Biological inference on initial hand
    action_id, telemetry, active_spikes = agent.decide(CURRENT_STATE, record_spikes=True)
    optimal_act = optimal_basic_strategy(CURRENT_STATE)

    # Stream spikes over WebSocket
    if active_spikes:
        asyncio.create_task(ws_manager.broadcast({
            "type": "SPIKE_BURST",
            "events": active_spikes,
            "state": telemetry["state"],
        }))

    return {
        "player_cards": GAME_ENV.player_cards,
        "dealer_cards": [GAME_ENV.dealer_cards[0], "HIDDEN"],
        "dealer_upcard": CURRENT_STATE.dealer_card,
        "player_total": CURRENT_STATE.player_sum,
        "usable_ace": CURRENT_STATE.usable_ace,
        "recommended_action": telemetry["action"],
        "optimal_action": "HIT" if optimal_act == BlackjackEnv.HIT else "STAND",
        "q_values": {
            "STAND": telemetry["q_stand"],
            "HIT": telemetry["q_hit"],
        },
        "confidence": telemetry["confidence"],
        "done": False,
    }


@app.post("/api/game/step")
async def step_game(req: StepRequest):
    """Executes a player or connectome decision (HIT or STAND)."""
    global CURRENT_STATE
    agent = get_agent()

    if CURRENT_STATE is None:
        return await new_game()

    # Determine action: if not specified, agent plays its own decision
    if req.action is None or req.action.upper() == "AUTO":
        action_id, telemetry, active_spikes = agent.decide(CURRENT_STATE, record_spikes=True)
    elif req.action.upper() == "HIT":
        action_id = BlackjackEnv.HIT
        _, telemetry, active_spikes = agent.decide(CURRENT_STATE, record_spikes=True)
    else:
        action_id = BlackjackEnv.STAND
        _, telemetry, active_spikes = agent.decide(CURRENT_STATE, record_spikes=True)

    # Step the Blackjack MDP
    next_state, reward, done, info = GAME_ENV.step(action_id)
    CURRENT_STATE = next_state if not done else None

    # Stream biological spike burst to 3D visualizer
    if active_spikes:
        asyncio.create_task(ws_manager.broadcast({
            "type": "SPIKE_BURST",
            "events": active_spikes,
            "action": telemetry["action"],
            "reward": reward,
        }))

    # Next state recommendation if game continues
    next_rec = None
    if not done and CURRENT_STATE is not None:
        _, next_telem, _ = agent.decide(CURRENT_STATE, record_spikes=False)
        next_rec = next_telem["action"]

    return {
        "action_taken": "HIT" if action_id == BlackjackEnv.HIT else "STAND",
        "player_cards": GAME_ENV.player_cards,
        "dealer_cards": GAME_ENV.dealer_cards if done else [GAME_ENV.dealer_cards[0], "HIDDEN"],
        "player_total": info.get("player_total", next_state.player_sum if next_state else 0),
        "dealer_total": info.get("dealer_total", 0 if not done else None),
        "reward": reward,
        "done": done,
        "result_message": info.get("result", ""),
        "q_values": {
            "STAND": telemetry["q_stand"],
            "HIT": telemetry["q_hit"],
        },
        "next_recommendation": next_rec,
    }


@app.post("/api/training/run")
async def run_training(req: TrainRequest):
    """Triggers an online training batch to refine Q-readout weights."""
    agent = get_agent()
    stats = agent.pretrain(num_episodes=req.num_hands, eval_interval=max(100, req.num_hands // 4))
    return stats


@app.get("/api/benchmark")
async def run_benchmark():
    """Runs standard evaluation benchmark."""
    agent = get_agent()
    eval_stats = agent.evaluate(num_eval_episodes=1000)
    return eval_stats


@app.websocket("/ws/connectome")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep alive and receive control messages
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "PING":
                await websocket.send_json({"type": "PONG"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# Mount static directory for frontend web UI
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
