/**
 * table3d.js
 * ==========
 * Photorealistic 3D Casino Blackjack Table and Anatomical Drosophila Agent.
 * Completely resolves all object collisions from Photo 2:
 * - Chips safely nested in upper-left corner
 * - Card shoe realistically angled in upper-right with card slot lip
 * - Betting circle and chip perfectly co-centered
 * - Cards smoothly glide/slide from the shoe to the felt slots in real-time 3D arcs
 * - Realistic Drosophila fruit fly with articulated legs, red eyes, and chitin segments
 * - Physical leg gestures: Foreleg Table Tap (Hit) and Bilateral Wave (Stand)
 */

class FlyJackTable3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1b12);
    this.scene.fog = new THREE.FogExp2(0x0c1b12, 0.0016);

    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.5, 2000);
    // Camera positioned with clear view of table, fly, cards, and shoe
    this.camera.position.set(-18, 70, 115);
    this.camera.lookAt(6, 4, -8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.minDistance = 35;
    this.controls.maxDistance = 240;
    this.controls.target.set(6, 4, -8);

    // Dynamic Objects
    this.cardMeshes = [];
    this.flyGroup = null;
    this.forelegPivotR = null;
    this.forelegPivotL = null;
    this.wingsGroup = null;
    this.abdomenMesh = null;

    // Animation & Card Flight Tracking
    this.clock = new THREE.Clock();
    this.activeCardAnimations = [];
    this.isTapping = false;
    this.tapPhase = 0.0;
    this.isWaving = false;
    this.wavePhase = 0.0;

    // Hand tracking for smooth incremental dealing
    this.currentHand = {
      playerCards: [],
      dealerCards: [],
      playerCardMeshes: [],
      dealerCardMeshes: [],
    };
    this.playerScoreMesh = null;
    this.dealerScoreMesh = null;

    // Card Shoe Mouth Origin (Where new cards fly out from!)
    this.SHOE_ORIGIN = new THREE.Vector3(42, 7.5, -55);

    this.initLighting();
    this.buildTableLayout();
    this.buildAnatomicalFly();
    this.setupResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    // Warm overhead casino spotlight
    const spot = new THREE.SpotLight(0xfffaed, 2.4, 400, Math.PI / 3, 0.45, 1.2);
    spot.position.set(-5, 115, 25);
    spot.castShadow = true;
    spot.shadow.mapSize.width = 2048;
    spot.shadow.mapSize.height = 2048;
    spot.shadow.camera.near = 25;
    spot.shadow.camera.far = 280;
    spot.shadow.bias = -0.0004;
    this.scene.add(spot);

    // Subtle table rim fill
    const fill = new THREE.DirectionalLight(0x4ade80, 0.4);
    fill.position.set(60, 45, -30);
    this.scene.add(fill);
  }

  setupResize() {
    window.addEventListener("resize", () => {
      this.width = this.container.clientWidth || window.innerWidth;
      this.height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });
  }

  buildTableLayout() {
    // 1. Green Felt Table Surface
    const feltGeo = new THREE.PlaneGeometry(360, 240, 32, 32);
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x1e7841,
      roughness: 0.85,
      metalness: 0.04,
    });
    const table = new THREE.Mesh(feltGeo, feltMat);
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    // 2. High-Res Felt Decal Canvas (Curved Text, Card Slots, Betting Circle)
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center at table origin
    ctx.translate(canvas.width / 2, 820);

    // Golden Curved Casino Arc
    ctx.strokeStyle = "rgba(245, 220, 140, 0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 720, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Golden Text along Arc
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = "rgba(245, 225, 155, 0.95)";
    ctx.textAlign = "center";
    ctx.letterSpacing = "6px";
    ctx.fillText("BLACKJACK-V1  •  NO DOUBLING  •  NO SPLITTING", 0, -750);

    ctx.font = "900 46px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = "rgba(255, 235, 165, 0.98)";
    ctx.fillText("DEALER MUST STAND ON 17", 0, -670);

    // Card Placement Dashed Outlines
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    ctx.lineWidth = 3;

    // Fly's Card Slot (-5 to +35, z: -10 to +15)
    ctx.strokeRect(-20, -380, 200, 210);

    // Dealer's Card Slot (z: -45 to -20)
    ctx.strokeRect(-20, -620, 200, 210);

    // Betting circle centered at X: -220, Y: -180
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(245, 220, 140, 0.85)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(-240, -180, 68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    const decalTex = new THREE.CanvasTexture(canvas);
    decalTex.anisotropy = 8;
    const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false });
    const decalPlane = new THREE.Mesh(new THREE.PlaneGeometry(280, 140), decalMat);
    decalPlane.rotation.x = -Math.PI / 2;
    decalPlane.position.set(0, 0.05, 5);
    this.scene.add(decalPlane);

    // 3. Stacks of Poker Chips (Safely placed in Upper-Left Corner: X = -85 to -55, Z = -45)
    this.buildChipStacks();

    // 4. Betting Chip (Accurately co-centered with the circle at X: -32, Z: 20)
    this.buildBettingChip(-33.0, 0.75, 20.0);

    // 5. Card Shoe (Angled in Upper-Right at X: 42, Z: -55)
    this.buildCardShoe();
  }

  buildChipStacks() {
    const chipGeo = new THREE.CylinderGeometry(4.2, 4.2, 1.4, 28);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd92d20, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.4 });

    // Place chip stacks in the upper-left, far from the fly!
    const stackPositions = [
      [-85, 0, -48],
      [-77, 0, -46],
      [-69, 0, -44],
      [-61, 0, -42],
      [-53, 0, -40],
    ];

    stackPositions.forEach((pos, idx) => {
      const height = 5 + (idx % 3) * 2;
      for (let c = 0; c < height; c++) {
        const mat = (c % 2 === 0) ? redMat : whiteMat;
        const chip = new THREE.Mesh(chipGeo, mat);
        chip.position.set(pos[0], c * 1.4 + 0.7, pos[2]);
        chip.castShadow = true;
        chip.receiveShadow = true;
        this.scene.add(chip);
      }
    });
  }

  buildBettingChip(x, y, z) {
    const chipGeo = new THREE.CylinderGeometry(5.2, 5.2, 1.5, 32);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.35, metalness: 0.15 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(x, y, z);
    chip.castShadow = true;
    chip.receiveShadow = true;
    this.scene.add(chip);

    const ringGeo = new THREE.RingGeometry(2.2, 3.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.76, z);
    this.scene.add(ring);
  }

  buildCardShoe() {
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(42, 0, -55);
    shoeGroup.rotation.y = -Math.PI * 0.22; // Angled toward cards

    // Black plastic shoe body
    const bodyGeo = new THREE.BoxGeometry(16, 14, 28);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 7, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    shoeGroup.add(body);

    // Front angled dispense lip
    const lipGeo = new THREE.BoxGeometry(16, 4, 8);
    const lip = new THREE.Mesh(lipGeo, bodyMat);
    lip.position.set(0, 2, 16);
    lip.rotation.x = 0.25;
    shoeGroup.add(lip);

    this.scene.add(shoeGroup);
  }

  /**
   * Anatomical Drosophila fruit fly with articulated legs planted firmly on the felt (Y=0)
   */
  buildAnatomicalFly() {
    this.flyGroup = new THREE.Group();
    // Positioned safely at X: -26, Z: -2 facing the player's card slots
    this.flyGroup.position.set(-26, 6.2, -2);
    this.flyGroup.rotation.y = Math.PI * 0.18; // Angled toward the cards

    const tanChitin = new THREE.MeshStandardMaterial({ color: 0xc89255, roughness: 0.5, metalness: 0.15 });
    const darkTanChitin = new THREE.MeshStandardMaterial({ color: 0x8b5321, roughness: 0.55, metalness: 0.1 });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xcc1818,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0x4a0a0a,
    });

    // 1. Thorax
    const thoraxGeo = new THREE.SphereGeometry(5.2, 20, 16);
    thoraxGeo.scale(1.0, 0.85, 1.25);
    const thorax = new THREE.Mesh(thoraxGeo, tanChitin);
    thorax.castShadow = true;
    this.flyGroup.add(thorax);

    // 2. Segmented Abdomen
    const abdomenGeo = new THREE.ConeGeometry(4.8, 13.5, 20);
    abdomenGeo.rotateX(Math.PI / 2);
    abdomenGeo.scale(1.0, 0.75, 1.0);
    this.abdomenMesh = new THREE.Mesh(abdomenGeo, darkTanChitin);
    this.abdomenMesh.position.set(0, 0.4, -9.5);
    this.abdomenMesh.rotation.x = -0.15;
    this.abdomenMesh.castShadow = true;
    this.flyGroup.add(this.abdomenMesh);

    // 3. Head & Compound Eyes
    const headGeo = new THREE.SphereGeometry(3.6, 18, 14);
    headGeo.scale(1.15, 0.9, 0.85);
    const head = new THREE.Mesh(headGeo, tanChitin);
    head.position.set(0, 0.6, 5.8);
    head.castShadow = true;
    this.flyGroup.add(head);

    const eyeGeo = new THREE.SphereGeometry(1.9, 16, 14);
    eyeGeo.scale(1.1, 1.2, 0.9);

    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-2.6, 1.0, 6.0);
    eyeL.rotation.y = -0.4;
    eyeL.castShadow = true;
    this.flyGroup.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(2.6, 1.0, 6.0);
    eyeR.rotation.y = 0.4;
    eyeR.castShadow = true;
    this.flyGroup.add(eyeR);

    // 4. Translucent Wings
    this.wingsGroup = new THREE.Group();
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(3.5, 7, 7, 17, 3.5, 24);
    wingShape.bezierCurveTo(0, 26, -5, 22, -4, 12);
    wingShape.bezierCurveTo(-3, 5, -1.5, 1.5, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape);
    wingGeo.rotateX(-Math.PI / 2);
    wingGeo.scale(0.8, 1.0, 0.9);

    const wingMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.62,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(-0.8, 4.0, -0.8);
    wingL.rotation.set(0.06, -0.12, -0.04);
    this.wingsGroup.add(wingL);

    const wingR = new THREE.Mesh(wingGeo, wingMat);
    wingR.position.set(0.8, 4.0, -0.8);
    wingR.rotation.set(0.06, 0.12, 0.04);
    this.wingsGroup.add(wingR);

    this.flyGroup.add(this.wingsGroup);

    // 5. Six Articulated Legs Reaching the Table (Y=0)
    this.buildLegs();

    this.scene.add(this.flyGroup);
  }

  buildLegs() {
    const legMat = new THREE.MeshStandardMaterial({ color: 0x8b5321, roughness: 0.6 });

    const createSegment = (len, r1 = 0.5, r2 = 0.35) => {
      const g = new THREE.CylinderGeometry(r2, r1, len, 8);
      g.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(g, legMat);
      m.castShadow = true;
      return m;
    };

    // Right Foreleg (Casino Tap Actuator)
    this.forelegPivotR = new THREE.Group();
    this.forelegPivotR.position.set(3.8, -0.2, 3.8);

    const femurR = createSegment(6.5, 0.55, 0.4);
    femurR.rotation.set(0.15, 0, -0.85);
    this.forelegPivotR.add(femurR);

    const tibiaR = createSegment(7.5, 0.4, 0.25);
    tibiaR.position.set(4.8, -4.0, 0.8);
    tibiaR.rotation.set(-0.25, 0, 0.55);
    this.forelegPivotR.add(tibiaR);

    this.flyGroup.add(this.forelegPivotR);

    // Left Foreleg
    this.forelegPivotL = new THREE.Group();
    this.forelegPivotL.position.set(-3.8, -0.2, 3.8);

    const femurL = createSegment(6.5, 0.55, 0.4);
    femurL.rotation.set(0.15, 0, 0.85);
    this.forelegPivotL.add(femurL);

    const tibiaL = createSegment(7.5, 0.4, 0.25);
    tibiaL.position.set(-4.8, -4.0, 0.8);
    tibiaL.rotation.set(-0.25, 0, -0.55);
    this.forelegPivotL.add(tibiaL);

    this.flyGroup.add(this.forelegPivotL);

    // Middle & Hind Legs (Stably supporting fly at Y=0)
    const midHind = [
      { x: 4.5, z: 0.0, fRot: [-0.1, 0, -1.0], tPos: [5.6, -3.6, -0.4], tRot: [0.2, 0, 0.65] },
      { x: -4.5, z: 0.0, fRot: [-0.1, 0, 1.0], tPos: [-5.6, -3.6, -0.4], tRot: [0.2, 0, -0.65] },
      { x: 4.0, z: -4.2, fRot: [-0.5, 0, -0.8], tPos: [4.8, -4.0, -3.6], tRot: [0.45, 0, 0.6] },
      { x: -4.0, z: -4.2, fRot: [-0.5, 0, 0.8], tPos: [-4.8, -4.0, -3.6], tRot: [0.45, 0, -0.6] },
    ];

    midHind.forEach((cfg) => {
      const p = new THREE.Group();
      p.position.set(cfg.x, -0.5, cfg.z);

      const f = createSegment(7.0, 0.55, 0.38);
      f.rotation.set(cfg.fRot[0], cfg.fRot[1], cfg.fRot[2]);
      p.add(f);

      const t = createSegment(8.5, 0.38, 0.25);
      t.position.set(cfg.tPos[0], cfg.tPos[1], cfg.tPos[2]);
      t.rotation.set(cfg.tRot[0], cfg.tRot[1], cfg.tRot[2]);
      p.add(t);

      this.flyGroup.add(p);
    });
  }

  /**
   * Spawns cards and slides them out of the Card Shoe across the felt in 3D!
   */
  dealCardWithSlide(val, isHidden, targetPos, targetRotY, delayMs = 0) {
    const card = this.create3DCardMesh(val, isHidden);
    card.position.copy(this.SHOE_ORIGIN);
    card.rotation.set(0.2, -Math.PI * 0.22, 0);
    card.visible = true;
    this.scene.add(card);
    this.cardMeshes.push(card);

    const startFlight = () => {
      if (!this.cardMeshes.includes(card)) return; // Hand was already cleared
      this.activeCardAnimations.push({
        mesh: card,
        startPos: this.SHOE_ORIGIN.clone(),
        targetPos: targetPos.clone(),
        startRot: card.rotation.clone(),
        targetRotY: targetRotY,
        progress: 0.0,
        duration: 0.35, // 350ms smooth flight
      });

      if (window.flyjack && window.flyjack.audio) {
        window.flyjack.audio.playCardDeal();
      }
    };

    if (delayMs <= 0) {
      startFlight();
    } else {
      setTimeout(startFlight, delayMs);
    }

    return card;
  }

  /**
   * Intelligently renders cards:
   * - On fresh hand: slides 2 player + 2 dealer cards out of shoe with staggered timing
   * - On HIT / incremental: keeps existing cards on table, only sliding the new card out of shoe
   * - On round end: smoothly reveals hidden dealer card and slides any dealer hit cards
   */
  renderCards(playerCards, dealerCards, isNewHand = false) {
    playerCards = Array.isArray(playerCards) ? playerCards : [];
    dealerCards = Array.isArray(dealerCards) ? dealerCards : [];

    if (
      isNewHand ||
      !this.currentHand.playerCards ||
      this.currentHand.playerCards.length === 0 ||
      playerCards.length < this.currentHand.playerCards.length
    ) {
      // Clear all existing cards for brand new deal
      this.cardMeshes.forEach((mesh) => this.scene.remove(mesh));
      this.cardMeshes = [];
      this.activeCardAnimations = [];
      this.currentHand = {
        playerCards: [],
        dealerCards: [],
        playerCardMeshes: [],
        dealerCardMeshes: [],
      };

      // 1. Deal Player's initial cards (In front of the fly: X = 0 to 22, Z = -5)
      playerCards.forEach((val, idx) => {
        const targetPos = new THREE.Vector3(2.0 + idx * 9.5, 0.35 + idx * 0.08, -6.0 + idx * 1.5);
        const mesh = this.dealCardWithSlide(val, false, targetPos, -0.04 * idx, idx * 160);
        this.currentHand.playerCardMeshes.push(mesh);
        this.currentHand.playerCards.push(val);
      });

      // 2. Deal Dealer's initial cards (Upper section: X = 2 to 24, Z = -32)
      dealerCards.forEach((val, idx) => {
        const isHidden = val === "HIDDEN";
        const targetPos = new THREE.Vector3(2.0 + idx * 9.5, 0.35 + idx * 0.08, -32.0 + idx * 1.5);
        const mesh = this.dealCardWithSlide(val, isHidden, targetPos, -0.04 * idx, (playerCards.length + idx) * 160);
        this.currentHand.dealerCardMeshes.push(mesh);
        this.currentHand.dealerCards.push(val);
      });
    } else {
      // Incremental deal - only slide newly added cards!
      // 1. Check for newly dealt player cards (HIT)
      for (let idx = this.currentHand.playerCards.length; idx < playerCards.length; idx++) {
        const val = playerCards[idx];
        const targetPos = new THREE.Vector3(2.0 + idx * 9.5, 0.35 + idx * 0.08, -6.0 + idx * 1.5);
        const mesh = this.dealCardWithSlide(val, false, targetPos, -0.04 * idx, 0);
        this.currentHand.playerCardMeshes.push(mesh);
        this.currentHand.playerCards.push(val);
      }

      // 2. Check if dealer revealed the hidden hole card
      if (
        this.currentHand.dealerCards &&
        this.currentHand.dealerCards[1] === "HIDDEN" &&
        dealerCards[1] &&
        dealerCards[1] !== "HIDDEN"
      ) {
        const hiddenMesh = this.currentHand.dealerCardMeshes[1];
        if (hiddenMesh) this.scene.remove(hiddenMesh);
        const targetPos = new THREE.Vector3(2.0 + 1 * 9.5, 0.35 + 1 * 0.08, -32.0 + 1 * 1.5);
        const revealedMesh = this.dealCardWithSlide(dealerCards[1], false, targetPos, -0.04 * 1, 0);
        this.currentHand.dealerCardMeshes[1] = revealedMesh;
        this.currentHand.dealerCards[1] = dealerCards[1];
      }

      // 3. Check for extra dealer cards drawn
      for (let idx = this.currentHand.dealerCards.length; idx < dealerCards.length; idx++) {
        const val = dealerCards[idx];
        const targetPos = new THREE.Vector3(2.0 + idx * 9.5, 0.35 + idx * 0.08, -32.0 + idx * 1.5);
        const delay = (idx - this.currentHand.dealerCards.length) * 220;
        const mesh = this.dealCardWithSlide(val, false, targetPos, -0.04 * idx, delay);
        this.currentHand.dealerCardMeshes.push(mesh);
        this.currentHand.dealerCards.push(val);
      }
    }
  }

  /**
   * Real-time 3D score badges on the felt surface for Fly and Dealer
   */
  update3DScores(playerTotal, dealerTotal, is21 = false, isDone = false) {
    if (!this.playerScoreMesh) {
      const geo = new THREE.PlaneGeometry(16, 5);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      this.playerScoreMesh = new THREE.Mesh(geo, mat);
      this.playerScoreMesh.rotation.x = -Math.PI / 2;
      this.playerScoreMesh.position.set(10.0, 0.45, 6.0);
      this.scene.add(this.playerScoreMesh);
      this.playerScoreMesh.canvas = canvas;
      this.playerScoreMesh.tex = tex;
    }

    if (!this.dealerScoreMesh) {
      const geo = new THREE.PlaneGeometry(16, 5);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      this.dealerScoreMesh = new THREE.Mesh(geo, mat);
      this.dealerScoreMesh.rotation.x = -Math.PI / 2;
      this.dealerScoreMesh.position.set(10.0, 0.45, -20.0);
      this.scene.add(this.dealerScoreMesh);
      this.dealerScoreMesh.canvas = canvas;
      this.dealerScoreMesh.tex = tex;
    }

    // Render Player Score Badge
    const pCtx = this.playerScoreMesh.canvas.getContext("2d");
    pCtx.clearRect(0, 0, 256, 80);
    pCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    if (pCtx.roundRect) pCtx.roundRect(4, 4, 248, 72, 12);
    else pCtx.rect(4, 4, 248, 72);
    pCtx.fill();

    if (is21) {
      pCtx.strokeStyle = "#fbbf24";
      pCtx.lineWidth = 6;
      pCtx.stroke();
      pCtx.fillStyle = "#fbbf24";
      pCtx.font = "bold 24px Arial";
      pCtx.textAlign = "center";
      pCtx.fillText("★ 21 BLACKJACK ★", 128, 48);
    } else if (playerTotal > 21) {
      pCtx.strokeStyle = "#ef4444";
      pCtx.lineWidth = 5;
      pCtx.stroke();
      pCtx.fillStyle = "#ef4444";
      pCtx.font = "bold 26px Arial";
      pCtx.textAlign = "center";
      pCtx.fillText(`FLY: ${playerTotal} (BUST)`, 128, 48);
    } else {
      pCtx.strokeStyle = "rgba(56, 189, 248, 0.6)";
      pCtx.lineWidth = 4;
      pCtx.stroke();
      pCtx.fillStyle = "#38bdf8";
      pCtx.font = "bold 28px Arial";
      pCtx.textAlign = "center";
      pCtx.fillText(`FLY: ${playerTotal}`, 128, 48);
    }
    this.playerScoreMesh.tex.needsUpdate = true;

    // Render Dealer Score Badge
    const dCtx = this.dealerScoreMesh.canvas.getContext("2d");
    dCtx.clearRect(0, 0, 256, 80);
    dCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    if (dCtx.roundRect) dCtx.roundRect(4, 4, 248, 72, 12);
    else dCtx.rect(4, 4, 248, 72);
    dCtx.fill();

    const dText = isDone && dealerTotal ? `DEALER: ${dealerTotal}` : "DEALER: ?";
    const isDealerBust = isDone && dealerTotal && dealerTotal > 21;

    if (isDealerBust) {
      dCtx.strokeStyle = "#ef4444";
      dCtx.lineWidth = 5;
      dCtx.stroke();
      dCtx.fillStyle = "#ef4444";
      dCtx.font = "bold 26px Arial";
      dCtx.textAlign = "center";
      dCtx.fillText(`DEALER: ${dealerTotal} (BUST)`, 128, 48);
    } else {
      dCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      dCtx.lineWidth = 4;
      dCtx.stroke();
      dCtx.fillStyle = "#e2e8f0";
      dCtx.font = "bold 28px Arial";
      dCtx.textAlign = "center";
      dCtx.fillText(dText, 128, 48);
    }
    this.dealerScoreMesh.tex.needsUpdate = true;
  }

  create3DCardMesh(val, isHidden) {
    const cardGeo = new THREE.BoxGeometry(10.5, 0.2, 14.5);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 356;
    const ctx = canvas.getContext("2d");

    if (isHidden) {
      // Pink/Red Lattice Pattern matching Photo 2 reference
      ctx.fillStyle = "#e11d48";
      ctx.fillRect(0, 0, 256, 356);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      for (let i = -100; i < 400; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 200, 356);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i + 200, 0);
        ctx.lineTo(i, 356);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 244, 344);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 356);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 248, 348);

      const suits = ["♠", "♥", "♦", "♣"];
      const suit = suits[Math.abs((val * 7) % suits.length)];
      const isRed = suit === "♥" || suit === "♦";

      let rank = val;
      if (val === 1) rank = "A";
      else if (val === 11) rank = "J";
      else if (val === 12) rank = "Q";
      else if (val === 13) rank = "K";

      ctx.fillStyle = isRed ? "#dc2626" : "#0f172a";
      ctx.font = "bold 56px Arial";
      ctx.fillText(rank, 18, 58);
      ctx.font = "48px Arial";
      ctx.fillText(suit, 22, 110);

      ctx.font = "96px Arial";
      ctx.textAlign = "center";
      ctx.fillText(suit, 128, 210);
    }

    const frontTex = new THREE.CanvasTexture(canvas);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35 });

    const materials = [edgeMat, edgeMat, frontMat, edgeMat, edgeMat, edgeMat];
    const mesh = new THREE.Mesh(cardGeo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Fly Physically Taps Table (HIT)
   */
  triggerForelegTap(onComplete) {
    this.isTapping = true;
    this.tapPhase = 0.0;
    this.onTapComplete = onComplete;
  }

  /**
   * Fly Physically Waves Forelegs (STAND)
   */
  triggerForelegWave(onComplete) {
    this.isWaving = true;
    this.wavePhase = 0.0;
    this.onWaveComplete = onComplete;
  }

  animate() {
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // 1. Idle biological breathing & wing flutter
    if (this.wingsGroup) {
      this.wingsGroup.rotation.z = Math.sin(elapsed * 3.5) * 0.015;
    }
    if (this.abdomenMesh) {
      this.abdomenMesh.rotation.x = -0.15 + Math.sin(elapsed * 2.2) * 0.02;
    }

    // 2. Smooth 3D Card Dealing Arc Flight
    for (let i = this.activeCardAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeCardAnimations[i];
      anim.progress += dt / anim.duration;
      const t = Math.min(1.0, anim.progress);
      // Smooth ease-out curve
      const ease = 1 - Math.pow(1 - t, 3);

      // Parabolic flight trajectory (arc peaking in the air)
      const arcY = Math.sin(t * Math.PI) * 7.0;
      anim.mesh.position.lerpVectors(anim.startPos, anim.targetPos, ease);
      anim.mesh.position.y += arcY;

      // Rotate to flat table orientation
      anim.mesh.rotation.x = THREE.MathUtils.lerp(anim.startRot.x, 0, ease);
      anim.mesh.rotation.y = THREE.MathUtils.lerp(anim.startRot.y, anim.targetRotY, ease);

      if (t >= 1.0) {
        anim.mesh.position.copy(anim.targetPos);
        anim.mesh.rotation.set(0, anim.targetRotY, 0);
        this.activeCardAnimations.splice(i, 1);
      }
    }

    // 3. Foreleg Tap Animation (Casino HIT)
    if (this.isTapping && this.forelegPivotR) {
      this.tapPhase += 0.055;
      const angle = Math.sin(this.tapPhase * Math.PI * 2.0);
      if (this.tapPhase < 1.0) {
        this.forelegPivotR.rotation.x = Math.max(0, -angle * 0.6);
        this.forelegPivotR.position.y = -0.2 + Math.max(0, angle * 2.5);
      } else {
        this.isTapping = false;
        this.forelegPivotR.rotation.x = 0;
        this.forelegPivotR.position.y = -0.2;
        if (this.onTapComplete) this.onTapComplete();
      }
    }

    // 4. Foreleg Wave Animation (Casino STAND)
    if (this.isWaving && this.forelegPivotR && this.forelegPivotL) {
      this.wavePhase += 0.04;
      const wave = Math.sin(this.wavePhase * Math.PI * 3.0);
      if (this.wavePhase < 1.0) {
        this.forelegPivotR.rotation.z = -wave * 0.5;
        this.forelegPivotL.rotation.z = wave * 0.5;
      } else {
        this.isWaving = false;
        this.forelegPivotR.rotation.z = 0;
        this.forelegPivotL.rotation.z = 0;
        if (this.onWaveComplete) this.onWaveComplete();
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.FlyJackTable3D = FlyJackTable3D;
