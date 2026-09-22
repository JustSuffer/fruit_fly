/**
 * app.js
 * ======
 * Master Application Controller for FlyJack.
 * Coordinates the 3D Casino Table, the Embodied Drosophila Fly Agent,
 * the CNS Brain Monitor, procedural audio, local Connectome engine,
 * and both autonomous & interactive manual gameplay.
 */

class FlyJackMaster {
  constructor() {
    this.audio = new FlyJackAudio();
    this.engine = new ConnectomeBlackjackEngine();
    this.table3d = new FlyJackTable3D("table3d-container");
    this.cns3d = null; // Initialized when CNS is opened or in background
    this.cnsLoaded = false;

    // Simulation & Game State
    this.autoPlay = true;
    this.speedMultiplier = 1.0;
    this.trialNumber = 5;
    this.bankroll = 102;
    this.currentBet = 10;
    this.stats = { w: 6, d: 3, l: 4 };

    this.gameState = null;
    this.isStepping = false;
    this.timerId = null;

    this.initDOM();
    this.bindEvents();
    this.initCNSInBackground();

    // Start initial hand immediately
    setTimeout(() => {
      this.dealNewHand();
    }, 100);
  }

  initDOM() {
    // Top Bar Controls
    this.btnDeal = document.getElementById("btnDeal");
    this.btnHit = document.getElementById("btnHit");
    this.btnDouble = document.getElementById("btnDouble");
    this.btnStand = document.getElementById("btnStand");
    this.chkAutoPlay = document.getElementById("chkAutoPlay");
    this.selSpeed = document.getElementById("selSpeed");
    this.btnSkip = document.getElementById("btnSkip");
    this.btnSound = document.getElementById("btnSound");
    this.btnExplore = document.getElementById("btnExplore");
    this.exploreMenu = document.getElementById("exploreMenu");
    this.btnHelp = document.getElementById("btnHelp");
    this.helpModal = document.getElementById("helpModal");
    this.btnCloseHelp = document.getElementById("btnCloseHelp");

    // Scoreboard
    this.bankrollValEl = document.getElementById("bankrollVal");
    this.statWEl = document.getElementById("statW");
    this.statDEl = document.getElementById("statD");
    this.statLEl = document.getElementById("statL");

    // PiP Window
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
    this.barQDouble = document.getElementById("barQDouble");
    this.valQDouble = document.getElementById("valQDouble");

    this.flyDecision = document.getElementById("flyDecision");
    this.optDecision = document.getElementById("optDecision");
    this.badgeMatch = document.getElementById("badgeMatch");

    // HUD Action Buttons
    this.hudBtnHit = document.getElementById("hudBtnHit");
    this.hudBtnDouble = document.getElementById("hudBtnDouble");
    this.hudBtnStand = document.getElementById("hudBtnStand");
    this.hudBtnDeal = document.getElementById("hudBtnDeal");
  }

  bindEvents() {
    // Deal Hand
    const onDealClick = () => {
      this.dealNewHand();
    };
    if (this.btnDeal) this.btnDeal.addEventListener("click", onDealClick);
    if (this.hudBtnDeal) this.hudBtnDeal.addEventListener("click", onDealClick);

    // Hit Action (Fly physically taps leg and draws card)
    const onHitClick = () => {
      if (this.gameState && !this.gameState.done && !this.isStepping) {
        this.executeFlyDecision("HIT");
      }
    };
    if (this.btnHit) this.btnHit.addEventListener("click", onHitClick);
    if (this.hudBtnHit) this.hudBtnHit.addEventListener("click", onHitClick);

    // Double Down Action (Fly rapidly double-taps leg, 2x bet, draws 1 card)
    const onDoubleClick = () => {
      if (this.gameState && !this.gameState.done && !this.isStepping && this.gameState.can_double) {
        this.executeFlyDecision("DOUBLE");
      }
    };
    if (this.btnDouble) this.btnDouble.addEventListener("click", onDoubleClick);
    if (this.hudBtnDouble) this.hudBtnDouble.addEventListener("click", onDoubleClick);

    // Stand Action (Fly physically waves forelegs and stands)
    const onStandClick = () => {
      if (this.gameState && !this.gameState.done && !this.isStepping) {
        this.executeFlyDecision("STAND");
      }
    };
    if (this.btnStand) this.btnStand.addEventListener("click", onStandClick);
    if (this.hudBtnStand) this.hudBtnStand.addEventListener("click", onStandClick);

    // Auto-Play toggle
    this.chkAutoPlay.addEventListener("change", (e) => {
      this.autoPlay = e.target.checked;
      this.updateButtonStates();
      if (this.autoPlay && (!this.gameState || this.gameState.done)) {
        this.dealNewHand();
      } else if (this.autoPlay && this.gameState && !this.gameState.done && !this.isStepping) {
        this.executeFlyDecision();
      }
    });

    this.selSpeed.addEventListener("change", (e) => {
      this.speedMultiplier = parseFloat(e.target.value);
    });

    this.btnSkip.addEventListener("click", () => {
      if (this.gameState && !this.gameState.done) {
        this.executeFlyDecision(null, true); // Instant skip
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

  updateButtonStates() {
    const isPlaying = this.gameState && !this.gameState.done && !this.isStepping;
    const canDouble = isPlaying && Boolean(this.gameState && this.gameState.can_double);

    if (this.btnHit) this.btnHit.disabled = !isPlaying;
    if (this.btnDouble) this.btnDouble.disabled = !canDouble;
    if (this.btnStand) this.btnStand.disabled = !isPlaying;

    if (this.hudBtnHit) this.hudBtnHit.disabled = !isPlaying;
    if (this.hudBtnDouble) this.hudBtnDouble.disabled = !canDouble;
    if (this.hudBtnStand) this.hudBtnStand.disabled = !isPlaying;

    const canDeal = !this.isStepping && (!this.gameState || this.gameState.done || !this.autoPlay);
    if (this.btnDeal) this.btnDeal.disabled = !canDeal;
    if (this.hudBtnDeal) this.hudBtnDeal.disabled = !canDeal;
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
        const bRes = await fetch("/bundle.json?v=3.0.0");
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

  dealNewHand() {
    if (this.isStepping) return;
    clearTimeout(this.timerId);

    this.trialNumber++;
    this.hudTrial.innerText = this.trialNumber;
    this.hudStateTitle.innerText = "Placing 10 Bet & Dealing...";
    this.hudStateTitle.style.color = "#38bdf8";

    // 1. Deduct initial 10-coin bet and animate chip flight into circle
    this.currentBet = 10;
    this.bankroll = Math.max(0, this.bankroll - 10);
    this.updateScoreboard();
    this.audio.playChip();
    this.table3d.placeInitialBet();

    // 2. Generate fresh connectome hand INSTANTLY (0ms) - completely immune to slow network/cold starts
    const data = this.engine.newGame();
    this.gameState = data;
    this.updateButtonStates();

    const is21 = data.is_21 || data.player_total === 21;

    // Deal fresh cards sliding out from the card shoe in 3D
    this.table3d.renderCards(data.player_cards, data.dealer_cards, true);
    this.table3d.update3DScores(data.player_total, data.dealer_total, is21, data.done);
    this.updateHUD(data);

    if (this.cns3d && this.cns3d.triggerBiologicalWave) {
      this.cns3d.triggerBiologicalWave();
    }

    // Optional background sync with server
    try {
      fetch("/api/game/new", { method: "POST" }).catch(() => {});
    } catch (e) {}

    if (data.done) {
      // Natural 21 Blackjack on deal!
      setTimeout(() => {
        this.handleRoundFinish(data);
      }, 950 / this.speedMultiplier);
    } else {
      if (this.autoPlay) {
        // Fly's autonomous turn
        const delay = 1000 / this.speedMultiplier;
        this.timerId = setTimeout(() => {
          this.executeFlyDecision();
        }, delay);
      } else {
        const pTotal = data.player_total;
        const dUpcard = data.dealer_upcard;
        this.hudStateTitle.innerText = `Fly's Turn (${pTotal} vs ${dUpcard}) - Click HIT, DOUBLE, or STAND`;
        this.hudStateTitle.style.color = "#e2e8f0";
      }
    }
  }

  executeFlyDecision(action = null, skipAnimation = false) {
    if (!this.gameState || this.gameState.done || this.isStepping) return;
    this.isStepping = true;
    this.updateButtonStates();

    const chosenAction = action || this.gameState.recommended_action || "HIT";

    if (chosenAction === "DOUBLE") {
      this.currentBet = 20;
      this.bankroll = Math.max(0, this.bankroll - 10); // 2nd 10-coin chip placed
      this.updateScoreboard();
      this.hudStateTitle.innerText = "Fly Doubling Down (2x Bet & Tap)!";
      this.hudStateTitle.style.color = "#c084fc";
      this.audio.playChip();
      this.table3d.placeDoubleBet();
    } else {
      this.hudStateTitle.innerText = `Fly Deciding: ${chosenAction}`;
      this.hudStateTitle.style.color = chosenAction === "HIT" ? "#60a5fa" : "#fbbf24";
    }

    // Trigger CNS Brain Spikes in PiP window
    if (this.cns3d && this.cns3d.triggerBiologicalWave) {
      this.cns3d.triggerBiologicalWave();
    }

    const onPhysicalActionComplete = () => {
      // Step client-side engine with Drosophila Connectome state
      const data = this.engine.step(chosenAction);
      this.gameState = data;
      this.isStepping = false;
      this.updateButtonStates();

      const is21 = data.is_21 || data.player_total === 21;

      // Smooth incremental dealing (only slides the newly drawn card)
      this.table3d.renderCards(data.player_cards, data.dealer_cards, false);
      this.table3d.update3DScores(data.player_total, data.dealer_total, is21, data.done);
      this.updateHUD(data);

      // Optional background sync
      try {
        fetch("/api/game/step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: chosenAction }),
        }).catch(() => {});
      } catch (e) {}

      if (data.done) {
        this.handleRoundFinish(data);
      } else {
        if (this.autoPlay) {
          // Continue fly's turn if hit didn't bust
          const delay = 1000 / this.speedMultiplier;
          this.timerId = setTimeout(() => {
            this.executeFlyDecision();
          }, delay);
        } else {
          const pTotal = data.player_total;
          this.hudStateTitle.innerText = `Fly Total: ${pTotal} - Click HIT or STAND`;
          this.hudStateTitle.style.color = "#e2e8f0";
        }
      }
    };

    if (skipAnimation) {
      onPhysicalActionComplete();
      return;
    }

    // Physical Drosophila Body Movement - Fly acts as the real physical casino player!
    if (chosenAction === "HIT") {
      this.audio.playLegTap();
      this.table3d.triggerForelegTap(() => {
        onPhysicalActionComplete();
      });
    } else if (chosenAction === "DOUBLE") {
      this.audio.playLegTap();
      this.table3d.triggerForelegDoubleTap(() => {
        onPhysicalActionComplete();
      });
    } else {
      this.table3d.triggerForelegWave(() => {
        onPhysicalActionComplete();
      });
    }
  }

  handleRoundFinish(data) {
    const is21 = data.is_21 || data.player_total === 21;
    const isBJ = data.is_blackjack;
    const isDoubled = this.currentBet === 20;

    if (data.reward > 0) {
      let winProfit = this.currentBet;
      if (isBJ) {
        winProfit = Math.round(this.currentBet * 1.5);
      }
      const returnTotal = this.currentBet + winProfit;
      this.bankroll += returnTotal;
      this.stats.w++;

      if (isBJ) {
        this.hudStateTitle.innerHTML = `<span class="badge-blackjack-21">★ 21 BLACKJACK! (+${winProfit}) ★</span>`;
        this.hudStateTitle.style.color = "#34d399";
      } else if (isDoubled) {
        this.hudStateTitle.innerHTML = `<span class="badge-21" style="border-color:#c084fc; color:#c084fc;">★ DOUBLE DOWN WIN! (+${winProfit}) ★</span>`;
        this.hudStateTitle.style.color = "#c084fc";
      } else if (is21) {
        this.hudStateTitle.innerHTML = `<span class="badge-21">★ 21 WIN! (+${winProfit}) ★</span>`;
        this.hudStateTitle.style.color = "#34d399";
      } else {
        this.hudStateTitle.innerText = `Fly Wins! (+${winProfit})`;
        this.hudStateTitle.style.color = "#34d399";
      }
      this.audio.playWin();
      this.table3d.winChipsToPlayer(isBJ ? 1.5 : 1.0);
    } else if (data.reward < 0) {
      this.stats.l++;
      if (data.player_total > 21) {
        this.hudStateTitle.innerText = `Fly Busts (${data.player_total}) - Dealer Wins (-${this.currentBet})`;
      } else {
        this.hudStateTitle.innerText = `Dealer Wins (-${this.currentBet})`;
      }
      this.hudStateTitle.style.color = "#f87171";
      this.table3d.collectChipsDealer();
    } else {
      // Push (Tie) - original bet returned
      this.bankroll += this.currentBet;
      this.stats.d++;
      this.hudStateTitle.innerText = is21 ? "Push (Both 21) - Bet Returned" : "Push (Tie) - Bet Returned";
      this.hudStateTitle.style.color = "#fbbf24";
      this.audio.playChip();
      this.table3d.pushChipsToPlayer();
    }

    // Nectar Stipend Refill if depleted
    if (this.bankroll < 10) {
      this.bankroll += 100;
      this.hudStateTitle.innerText += " • Nectar Stipend: +100 Coins!";
    }

    this.updateScoreboard();
    this.updateButtonStates();

    // Auto-play next hand
    if (this.autoPlay) {
      const waitTime = 2300 / this.speedMultiplier;
      this.timerId = setTimeout(() => {
        this.dealNewHand();
      }, waitTime);
    }
  }

  updateHUD(data) {
    const pTotal = data.player_total || (data.player_cards ? data.player_cards.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) : 12);
    const dUpcard = data.dealer_upcard || (Array.isArray(data.dealer_cards) && typeof data.dealer_cards[0] === 'number' ? data.dealer_cards[0] : 7);
    const isAce = data.usable_ace || false;
    const is21 = data.is_21 || pTotal === 21;

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
    const qDouble = (data.q_values && data.q_values.DOUBLE !== undefined) ? data.q_values.DOUBLE : -0.520;

    this.valQStick.innerText = qStand.toFixed(3);
    this.valQHit.innerText = qHit.toFixed(3);
    if (this.valQDouble) this.valQDouble.innerText = qDouble.toFixed(3);

    // Normalize Q-meters for bar width (-1.0 ... +1.0)
    const normStick = Math.max(5, Math.min(100, ((qStand + 1.0) / 2.0) * 100));
    const normHit = Math.max(5, Math.min(100, ((qHit + 1.0) / 2.0) * 100));
    const normDouble = Math.max(5, Math.min(100, ((qDouble + 1.0) / 2.0) * 100));

    this.barQStick.style.width = `${normStick}%`;
    this.barQHit.style.width = `${normHit}%`;
    if (this.barQDouble) this.barQDouble.style.width = `${normDouble}%`;

    // Decisions & 21 Banner
    const act = data.next_recommendation || data.recommended_action || data.action_taken || "HIT";
    const opt = data.optimal_action || "HIT";

    this.flyDecision.innerText = is21 ? "21 (STAND)" : act;
    this.optDecision.innerText = is21 ? "STAND" : opt;

    if (act === opt || is21) {
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
