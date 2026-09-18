/**
 * app.js
 * ======
 * Frontend Application Controller for Drosophila Connectome Blackjack.
 * Handles game state, WebSocket live spike streaming, and UI reactivity.
 */

class ConnectomeBlackjackApp {
  constructor() {
    this.visualizer = new ConnectomeVisualizer3D("canvas3d");
    this.ws = null;
    this.gameState = null;
    this.stats = {
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
    };
    this.isAutoPlaying = false;
    this.autoPlayTimer = null;

    this.initDOM();
    this.initWebSocket();
    this.loadConnectomeData();
    this.bindEvents();
  }

  initDOM() {
    this.playerCardsEl = document.getElementById("playerCards");
    this.dealerCardsEl = document.getElementById("dealerCards");
    this.playerTotalEl = document.getElementById("playerTotal");
    this.dealerTotalEl = document.getElementById("dealerTotal");
    this.gameResultEl = document.getElementById("gameResult");

    this.recActionEl = document.getElementById("recAction");
    this.recOptimalEl = document.getElementById("recOptimal");
    this.confidenceEl = document.getElementById("confidenceVal");

    this.qStandValEl = document.getElementById("qStandVal");
    this.qHitValEl = document.getElementById("qHitVal");
    this.qStandBarEl = document.getElementById("qStandBar");
    this.qHitBarEl = document.getElementById("qHitBar");

    this.btnHit = document.getElementById("btnHit");
    this.btnStand = document.getElementById("btnStand");
    this.btnAutoStep = document.getElementById("btnAutoStep");
    this.btnNewHand = document.getElementById("btnNewHand");
    this.btnAutoPlay = document.getElementById("btnAutoPlay");
    this.btnTrain = document.getElementById("btnTrain");

    this.statWinsEl = document.getElementById("statWins");
    this.statLossesEl = document.getElementById("statLosses");
    this.statPushesEl = document.getElementById("statPushes");
    this.statWinRateEl = document.getElementById("statWinRate");

    this.neuronsCountEl = document.getElementById("metaNeurons");
    this.synapsesCountEl = document.getElementById("metaSynapses");
  }

  async loadConnectomeData() {
    try {
      const res = await fetch("/api/connectome/metadata");
      if (!res.ok) throw new Error("API returned " + res.status);
      const data = await res.json();
      this.visualizer.loadConnectome(data);

      if (this.neuronsCountEl) this.neuronsCountEl.innerText = data.num_neurons.toLocaleString();
      if (this.synapsesCountEl) this.synapsesCountEl.innerText = data.num_synapses.toLocaleString();

      // Start initial hand
      this.startNewHand();
    } catch (err) {
      console.warn("[App] API fetch failed, falling back to static bundle.json:", err);
      try {
        const bRes = await fetch("/bundle.json");
        const bData = await bRes.json();
        this.visualizer.loadConnectome(bData);
        if (this.neuronsCountEl) this.neuronsCountEl.innerText = bData.num_neurons.toLocaleString();
        if (this.synapsesCountEl) this.synapsesCountEl.innerText = bData.num_synapses.toLocaleString();
        this.startNewHand();
      } catch (e) {
        console.error("[App] Static bundle fallback failed:", e);
      }
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/connectome`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("[App::WS] Connected to Fruit Fly Connectome telemetry stream.");
      document.getElementById("wsStatus").innerText = "CONNECTED";
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "SPIKE_BURST" && msg.events) {
          this.visualizer.triggerSpikeBurst(msg.events);
        }
      } catch (err) {
        console.error("[App::WS] Error parsing WebSocket message:", err);
      }
    };

    this.ws.onclose = () => {
      document.getElementById("wsStatus").innerText = "RECONNECTING";
      setTimeout(() => this.initWebSocket(), 3000);
    };
  }

  bindEvents() {
    this.btnHit.addEventListener("click", () => this.stepHand("HIT"));
    this.btnStand.addEventListener("click", () => this.stepHand("STAND"));
    this.btnAutoStep.addEventListener("click", () => this.stepHand("AUTO"));
    this.btnNewHand.addEventListener("click", () => this.startNewHand());

    this.btnAutoPlay.addEventListener("click", () => this.toggleAutoPlay());
    this.btnTrain.addEventListener("click", () => this.runInteractiveTraining());

    // Camera preset buttons
    document.querySelectorAll("[data-cam]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.visualizer.setCameraView(e.target.getAttribute("data-cam"));
      });
    });
  }

  async startNewHand() {
    this.btnHit.disabled = false;
    this.btnStand.disabled = false;
    this.btnAutoStep.disabled = false;
    this.gameResultEl.innerText = "Biological Reservoir Active";
    this.gameResultEl.style.color = "#38bdf8";

    // Trigger biological wave animation
    if (this.visualizer) {
      this.visualizer.triggerBiologicalWave();
    }

    try {
      const res = await fetch("/api/game/new", { method: "POST" });
      const data = await res.json();
      this.gameState = data;
      this.renderTable(data);
    } catch (err) {
      console.error("[App] Failed to start new hand:", err);
    }
  }

  async stepHand(action) {
    if (this.visualizer) {
      this.visualizer.triggerBiologicalWave();
    }

    try {
      const res = await fetch("/api/game/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action }),
      });
      const data = await res.json();
      this.gameState = data;
      this.renderTable(data);

      if (data.done) {
        this.handleGameOver(data);
      }
    } catch (err) {
      console.error("[App] Step error:", err);
    }
  }

  renderTable(data) {
    // Render Player Cards
    this.playerCardsEl.innerHTML = "";
    (data.player_cards || []).forEach((c) => {
      this.playerCardsEl.appendChild(this.createCardElement(c));
    });
    this.playerTotalEl.innerText = `Total: ${data.player_total || ""}`;

    // Render Dealer Cards
    this.dealerCardsEl.innerHTML = "";
    (data.dealer_cards || []).forEach((c) => {
      this.dealerCardsEl.appendChild(this.createCardElement(c));
    });
    if (data.dealer_total) {
      this.dealerTotalEl.innerText = `Total: ${data.dealer_total}`;
    } else {
      this.dealerTotalEl.innerText = `Showing: ${data.dealer_upcard || (data.dealer_cards ? data.dealer_cards[0] : "")}`;
    }

    // Connectome Recommendation
    if (data.recommended_action || data.next_recommendation) {
      const rec = data.next_recommendation || data.recommended_action;
      this.recActionEl.innerText = rec;
      this.recActionEl.className = `decision-val ${rec === "HIT" ? "val-hit" : "val-stand"}`;
    }

    if (data.optimal_action) {
      this.recOptimalEl.innerText = data.optimal_action;
    }

    if (data.confidence !== undefined) {
      this.confidenceEl.innerText = `${(data.confidence * 100).toFixed(1)}%`;
    }

    // Q-Value Gauges
    if (data.q_values) {
      const qStand = data.q_values.STAND || 0;
      const qHit = data.q_values.HIT || 0;

      this.qStandValEl.innerText = qStand.toFixed(3);
      this.qHitValEl.innerText = qHit.toFixed(3);

      // Normalize for progress bars
      const minVal = Math.min(qStand, qHit, -1.0);
      const maxVal = Math.max(qStand, qHit, 1.0);
      const range = maxVal - minVal || 1.0;

      const normStand = Math.max(5, Math.min(100, ((qStand - minVal) / range) * 100));
      const normHit = Math.max(5, Math.min(100, ((qHit - minVal) / range) * 100));

      this.qStandBarEl.style.width = `${normStand}%`;
      this.qStandBarEl.style.backgroundColor = normStand > normHit ? "#10b981" : "#64748b";

      this.qHitBarEl.style.width = `${normHit}%`;
      this.qHitBarEl.style.backgroundColor = normHit >= normStand ? "#f59e0b" : "#64748b";
    }
  }

  createCardElement(val) {
    const card = document.createElement("div");
    if (val === "HIDDEN") {
      card.className = "playing-card hidden";
      return card;
    }

    // Suit assignment
    const suits = ["♠", "♥", "♦", "♣"];
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const isRed = suit === "♥" || suit === "♦";

    card.className = `playing-card ${isRed ? "red" : ""}`;
    let label = val;
    if (val === 1) label = "A";
    else if (val === 11) label = "J";
    else if (val === 12) label = "Q";
    else if (val === 13) label = "K";

    card.innerHTML = `
      <div style="font-size: 13px;">${label}</div>
      <div style="font-size: 20px; text-align: center;">${suit}</div>
      <div style="font-size: 13px; text-align: right;">${label}</div>
    `;
    return card;
  }

  handleGameOver(data) {
    this.btnHit.disabled = true;
    this.btnStand.disabled = true;
    this.btnAutoStep.disabled = true;

    this.stats.hands++;
    if (data.reward > 0) {
      this.stats.wins++;
      this.gameResultEl.innerText = `🏆 ${data.result_message || "Player Wins!"}`;
      this.gameResultEl.style.color = "#10b981";
    } else if (data.reward < 0) {
      this.stats.losses++;
      this.gameResultEl.innerText = `💀 ${data.result_message || "Dealer Wins!"}`;
      this.gameResultEl.style.color = "#ef4444";
    } else {
      this.stats.pushes++;
      this.gameResultEl.innerText = `🤝 ${data.result_message || "Push (Tie)"}`;
      this.gameResultEl.style.color = "#f59e0b";
    }

    this.updateStatsUI();

    if (this.isAutoPlaying) {
      this.autoPlayTimer = setTimeout(() => {
        if (this.isAutoPlaying) {
          this.startNewHand().then(() => {
            setTimeout(() => this.runAutoStep(), 400);
          });
        }
      }, 900);
    }
  }

  updateStatsUI() {
    this.statWinsEl.innerText = this.stats.wins;
    this.statLossesEl.innerText = this.stats.losses;
    this.statPushesEl.innerText = this.stats.pushes;

    const rate = this.stats.hands > 0 ? (this.stats.wins / this.stats.hands) * 100 : 0;
    this.statWinRateEl.innerText = `${rate.toFixed(1)}%`;
  }

  toggleAutoPlay() {
    this.isAutoPlaying = !this.isAutoPlaying;
    if (this.isAutoPlaying) {
      this.btnAutoPlay.innerText = "PAUSE AUTOPLAY";
      this.btnAutoPlay.style.background = "#dc2626";
      this.runAutoStep();
    } else {
      this.btnAutoPlay.innerText = "START AUTOPLAY";
      this.btnAutoPlay.style.background = "";
      clearTimeout(this.autoPlayTimer);
    }
  }

  async runAutoStep() {
    if (!this.isAutoPlaying) return;
    if (!this.gameState || this.gameState.done) {
      await this.startNewHand();
    }
    await this.stepHand("AUTO");

    if (this.isAutoPlaying && (!this.gameState || !this.gameState.done)) {
      this.autoPlayTimer = setTimeout(() => this.runAutoStep(), 600);
    }
  }

  async runInteractiveTraining() {
    this.btnTrain.disabled = true;
    this.btnTrain.innerText = "Training Brain...";

    try {
      const res = await fetch("/api/training/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ num_hands: 1000 }),
      });
      const stats = await res.json();
      alert(`Connectome Training Complete!\nEvaluated across 1,000 hands:\n• Win Rate: ${(stats.final_eval.win_rate*100).toFixed(1)}%\n• Policy Match: ${(stats.final_eval.policy_match_rate*100).toFixed(1)}%`);
    } catch (err) {
      console.error("[App] Training error:", err);
    } finally {
      this.btnTrain.disabled = false;
      this.btnTrain.innerText = "⚡ Train 1,000 Hands";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new ConnectomeBlackjackApp();
});
