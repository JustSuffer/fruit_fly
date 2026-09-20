/**
 * app.js
 * ======
 * Master Application Controller for FlyJack.
 * Coordinates the 3D Casino Table, the Embodied Drosophila Fly Agent,
 * the CNS Brain Monitor, procedural audio, and closed-loop autonomous gameplay.
 */

class FlyJackMaster {
  constructor() {
    this.audio = new FlyJackAudio();
    this.table3d = new FlyJackTable3D("table3d-container");
    this.cns3d = null; // Initialized when CNS is opened or in background
    this.cnsLoaded = false;

    // Simulation & Game State
    this.autoPlay = true;
    this.speedMultiplier = 1.0;
    this.trialNumber = 5;
    this.bankroll = 102;
    this.stats = { w: 6, d: 3, l: 4 };

    this.gameState = null;
    this.isStepping = false;
    this.timerId = null;

    this.initDOM();
    this.bindEvents();
    this.initCNSInBackground();

    // Start simulation loop
    setTimeout(() => {
      this.dealNewHand();
    }, 600);
  }

  initDOM() {
    this.btnDeal = document.getElementById("btnDeal");
    this.chkAutoPlay = document.getElementById("chkAutoPlay");
    this.selSpeed = document.getElementById("selSpeed");
    this.btnSkip = document.getElementById("btnSkip");
    this.btnSound = document.getElementById("btnSound");
    this.btnExplore = document.getElementById("btnExplore");
    this.exploreMenu = document.getElementById("exploreMenu");
    this.btnHelp = document.getElementById("btnHelp");
    this.helpModal = document.getElementById("helpModal");
    this.btnCloseHelp = document.getElementById("btnCloseHelp");

    this.bankrollValEl = document.getElementById("bankrollVal");
    this.statWEl = document.getElementById("statW");
    this.statDEl = document.getElementById("statD");
    this.statLEl = document.getElementById("statL");

    this.cnsContainer = document.getElementById("cns-container");
    this.btnClosePip = document.getElementById("btnClosePip");

    // HUD Elements
    this.hudStateTitle = document.getElementById("hudStateTitle");
    this.hudTrial = document.getElementById("hudTrial");
    this.rateDA1 = document.getElementById("rateDA1");
    this.rateVA1d = document.getElementById("rateVA1d");
    this.rateVA1v = document.getElementById("rateVA1v");

    this.barQStick = document.getElementById("barQStick");
    this.valQStick = document.getElementById("valQStick");
    this.barQHit = document.getElementById("barQHit");
    this.valQHit = document.getElementById("valQHit");

    this.flyDecision = document.getElementById("flyDecision");
    this.optDecision = document.getElementById("optDecision");
    this.badgeMatch = document.getElementById("badgeMatch");
  }

  bindEvents() {
    this.btnDeal.addEventListener("click", () => {
      this.dealNewHand();
    });

    this.chkAutoPlay.addEventListener("change", (e) => {
      this.autoPlay = e.target.checked;
      if (this.autoPlay && (!this.gameState || this.gameState.done)) {
        this.dealNewHand();
      }
    });

    this.selSpeed.addEventListener("change", (e) => {
      this.speedMultiplier = parseFloat(e.target.value);
    });

    this.btnSkip.addEventListener("click", () => {
      if (this.gameState && !this.gameState.done) {
        this.executeFlyDecision(true); // Instant skip
      }
    });

    this.btnSound.addEventListener("click", () => {
      const enabled = this.audio.toggle();
      this.btnSound.innerText = enabled ? "Sound on" : "Sound off";
      this.btnSound.style.color = enabled ? "#38bdf8" : "";
    });

    this.btnExplore.addEventListener("click", (e) => {
      e.stopPropagation();
      this.exploreMenu.classList.toggle("hidden");
    });

    document.addEventListener("click", () => {
      this.exploreMenu.classList.add("hidden");
    });

    document.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const view = e.target.getAttribute("data-view");
        this.switchView(view);
      });
    });

    this.btnClosePip.addEventListener("click", () => {
      this.cnsContainer.classList.add("hidden");
    });

    this.btnHelp.addEventListener("click", () => {
      this.helpModal.classList.remove("hidden");
    });

    this.btnCloseHelp.addEventListener("click", () => {
      this.helpModal.classList.add("hidden");
    });
  }

  async initCNSInBackground() {
    try {
      this.cns3d = new ConnectomeVisualizer3D("cns3d-canvas");
      let data = null;
      try {
        const res = await fetch("/api/connectome/metadata");
        if (res.ok) data = await res.json();
      } catch (e) {}

      if (!data) {
        const bRes = await fetch("/bundle.json");
        data = await bRes.json();
      }

      if (data) {
        this.cns3d.loadConnectome(data);
        this.cnsLoaded = true;
      }
    } catch (err) {
      console.warn("[FlyJack] Background CNS visualizer init deferred:", err);
    }
  }

  switchView(view) {
    if (view === "table") {
      this.cnsContainer.classList.add("hidden");
    } else if (view === "split" || view === "cns") {
      this.cnsContainer.classList.remove("hidden");
      if (this.cns3d && this.cns3d.setupResize) {
        this.cns3d.setupResize();
      }
    }
  }

  async dealNewHand() {
    if (this.isStepping) return;
    clearTimeout(this.timerId);

    this.trialNumber++;
    this.hudTrial.innerText = this.trialNumber;
    this.hudStateTitle.innerText = "Dealing";
    this.audio.playChip();

    try {
      const res = await fetch("/api/game/new", { method: "POST" });
      const data = await res.json();
      this.gameState = data;

      this.audio.playCardDeal();
      this.table3d.renderCards(data.player_cards, data.dealer_cards);
      this.updateHUD(data);

      if (this.cns3d && this.cns3d.triggerBiologicalWave) {
        this.cns3d.triggerBiologicalWave();
      }

      // Next step: Fly's autonomous turn
      const delay = 900 / this.speedMultiplier;
      this.timerId = setTimeout(() => {
        this.executeFlyDecision();
      }, delay);

    } catch (err) {
      console.error("[FlyJack] Deal error:", err);
    }
  }

  async executeFlyDecision(skipAnimation = false) {
    if (!this.gameState || this.gameState.done || this.isStepping) return;
    this.isStepping = true;

    const chosenAction = this.gameState.recommended_action || "HIT";
    this.hudStateTitle.innerText = `Fly Deciding (${chosenAction})`;

    // Trigger CNS Brain Spikes in PiP window
    if (this.cns3d && this.cns3d.triggerBiologicalWave) {
      this.cns3d.triggerBiologicalWave();
    }

    const onPhysicalActionComplete = async () => {
      try {
        const res = await fetch("/api/game/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: chosenAction }),
        });
        const data = await res.json();
        this.gameState = data;
        this.isStepping = false;

        this.audio.playCardDeal();
        this.table3d.renderCards(data.player_cards, data.dealer_cards);
        this.updateHUD(data);

        if (data.done) {
          this.handleRoundFinish(data);
        } else {
          // Continue fly's turn if hit didn't bust
          const delay = 1000 / this.speedMultiplier;
          this.timerId = setTimeout(() => {
            this.executeFlyDecision();
          }, delay);
        }
      } catch (err) {
        console.error("[FlyJack] Step error:", err);
        this.isStepping = false;
      }
    };

    if (skipAnimation) {
      onPhysicalActionComplete();
      return;
    }

    // Physical Drosophila Body Movement
    if (chosenAction === "HIT") {
      this.audio.playLegTap();
      this.table3d.triggerForelegTap(() => {
        onPhysicalActionComplete();
      });
    } else {
      this.table3d.triggerForelegWave(() => {
        onPhysicalActionComplete();
      });
    }
  }

  handleRoundFinish(data) {
    if (data.reward > 0) {
      this.bankroll += 10;
      this.stats.w++;
      this.hudStateTitle.innerText = "Fly Wins! (+10)";
      this.hudStateTitle.style.color = "#34d399";
      this.audio.playWin();
    } else if (data.reward < 0) {
      this.bankroll -= 10;
      this.stats.l++;
      this.hudStateTitle.innerText = "Dealer Wins (-10)";
      this.hudStateTitle.style.color = "#f87171";
    } else {
      this.stats.d++;
      this.hudStateTitle.innerText = "Push (Tie)";
      this.hudStateTitle.style.color = "#fbbf24";
      this.audio.playChip();
    }

    this.updateScoreboard();

    // Auto-play next hand
    if (this.autoPlay) {
      const waitTime = 1800 / this.speedMultiplier;
      this.timerId = setTimeout(() => {
        this.dealNewHand();
      }, waitTime);
    }
  }

  updateHUD(data) {
    const pTotal = data.player_total || (data.player_cards ? data.player_cards.reduce((a, b) => a + b, 0) : 12);
    const dUpcard = data.dealer_upcard || 7;
    const isAce = data.usable_ace || false;

    // Biological Glomeruli Frequencies (DA1, VA1d, VA1v)
    const da1 = Math.min(150, Math.max(20, Math.round(50 + pTotal * 4.2)));
    const va1d = Math.min(150, Math.max(20, Math.round(40 + dUpcard * 9.5)));
    const va1v = isAce ? 120 : 0;

    this.rateDA1.innerText = `${da1} Hz`;
    this.rateVA1d.innerText = `${va1d} Hz`;
    this.rateVA1v.innerText = `${va1v} Hz`;

    // Q-values
    const qStand = (data.q_values && data.q_values.STAND !== undefined) ? data.q_values.STAND : -0.491;
    const qHit = (data.q_values && data.q_values.HIT !== undefined) ? data.q_values.HIT : -0.438;

    this.valQStick.innerText = qStand.toFixed(3);
    this.valQHit.innerText = qHit.toFixed(3);

    // Normalize Q-meters for bar width (-1.0 ... +1.0)
    const normStick = Math.max(5, Math.min(100, ((qStand + 1.0) / 2.0) * 100));
    const normHit = Math.max(5, Math.min(100, ((qHit + 1.0) / 2.0) * 100));

    this.barQStick.style.width = `${normStick}%`;
    this.barQHit.style.width = `${normHit}%`;

    // Decisions
    const act = data.next_recommendation || data.recommended_action || data.action_taken || "HIT";
    const opt = data.optimal_action || "HIT";

    this.flyDecision.innerText = act;
    this.optDecision.innerText = opt;

    if (act === opt) {
      this.badgeMatch.innerText = "✓ matches";
      this.badgeMatch.className = "badge-match";
    } else {
      this.badgeMatch.innerText = "mismatch";
      this.badgeMatch.className = "badge-mismatch";
    }
  }

  updateScoreboard() {
    this.bankrollValEl.innerText = this.bankroll;
    this.statWEl.innerText = this.stats.w;
    this.statDEl.innerText = this.stats.d;
    this.statLEl.innerText = this.stats.l;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.flyjack = new FlyJackMaster();
});
