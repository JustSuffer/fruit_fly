/**
 * table3d.js
 * ==========
 * Complete 3D Casino Blackjack Table and Embodied Drosophila (Fruit Fly) Agent in Three.js.
 * Matches the FlyJack visual reference with green felt, chips, cards, and an articulated
 * 3D fruit fly that physically gestures Hit (foreleg tap) or Stand (bilateral wave).
 */

class FlyJackTable3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1b12); // Deep casino ambient
    this.scene.fog = new THREE.FogExp2(0x0c1b12, 0.0018);

    this.camera = new THREE.PerspectiveCamera(40, this.width / this.height, 0.5, 2000);
    // Position camera to look down at the table at a comfortable angle matching the reference
    this.camera.position.set(-15, 75, 125);
    this.camera.lookAt(10, 5, -5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 250;
    this.controls.target.set(10, 5, -5);

    // References
    this.cardsInPlay = [];
    this.cardMeshes = [];
    this.flyGroup = null;
    this.forelegPivotR = null;
    this.forelegPivotL = null;
    this.wingsMesh = null;
    this.abdomenMesh = null;

    // Animation States
    this.animationClock = new THREE.Clock();
    this.isTapping = false;
    this.tapProgress = 0.0;
    this.isWaving = false;
    this.waveProgress = 0.0;

    this.initLighting();
    this.buildTable();
    this.buildFlyModel();
    this.setupResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    // Main overhead warm casino table spotlight
    const tableSpot = new THREE.SpotLight(0xfffaed, 2.2, 350, Math.PI / 3, 0.45, 1.2);
    tableSpot.position.set(0, 110, 20);
    tableSpot.castShadow = true;
    tableSpot.shadow.mapSize.width = 2048;
    tableSpot.shadow.mapSize.height = 2048;
    tableSpot.shadow.camera.near = 20;
    tableSpot.shadow.camera.far = 250;
    tableSpot.shadow.bias = -0.0005;
    this.scene.add(tableSpot);

    // Soft green fill bounce light
    const fillLight = new THREE.DirectionalLight(0x4ade80, 0.35);
    fillLight.position.set(50, 40, -40);
    this.scene.add(fillLight);
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

  buildTable() {
    // 1. Green Felt Table Surface
    const feltGeo = new THREE.PlaneGeometry(350, 220, 32, 32);
    const feltMat = new THREE.MeshStandardMaterial({
      color: 0x1f7a42, // Rich casino green felt
      roughness: 0.82,
      metalness: 0.05,
    });
    const tableMesh = new THREE.Mesh(feltGeo, feltMat);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.receiveShadow = true;
    this.scene.add(tableMesh);

    // 2. Casino Text & Markings Decal Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");

    // Transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Golden Curved Casino Text
    ctx.save();
    ctx.translate(canvas.width / 2, 850);
    ctx.strokeStyle = "rgba(240, 215, 140, 0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 750, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Text along arc
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = "rgba(245, 225, 155, 0.9)";
    ctx.textAlign = "center";
    ctx.letterSpacing = "6px";
    ctx.fillText("BLACKJACK-V1  •  NO DOUBLING  •  NO SPLITTING", 0, -780);

    ctx.font = "900 44px -apple-system, BlinkMacSystemFont, Arial, sans-serif";
    ctx.fillStyle = "rgba(255, 235, 165, 0.95)";
    ctx.fillText("DEALER MUST STAND ON 17", 0, -700);

    // Card Placement Dashed Outlines
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;

    // Fly Card Outline
    ctx.strokeRect(-80, -320, 160, 220);

    // Dealer Card Outline
    ctx.strokeRect(-80, -620, 160, 220);

    // Betting circle
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(245, 225, 155, 0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(280, -220, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const decalTexture = new THREE.CanvasTexture(canvas);
    decalTexture.anisotropy = 8;
    const decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture,
      transparent: true,
      depthWrite: false,
    });
    const decalPlane = new THREE.Mesh(new THREE.PlaneGeometry(280, 140), decalMat);
    decalPlane.rotation.x = -Math.PI / 2;
    decalPlane.position.set(0, 0.05, 5);
    this.scene.add(decalPlane);

    // 3. Black Card Shoe in background
    const shoeGeo = new THREE.BoxGeometry(26, 12, 40);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.8 });
    const shoeMesh = new THREE.Mesh(shoeGeo, shoeMat);
    shoeMesh.position.set(-6, 6, -70);
    shoeMesh.castShadow = true;
    shoeMesh.receiveShadow = true;
    this.scene.add(shoeMesh);

    // 4. Stacks of Casino Poker Chips (Red and White Striped)
    this.buildChipStacks();

    // 5. Betting Chip in the Circle
    this.buildBettingChip(24, 0.7, -4);
  }

  buildChipStacks() {
    const chipGeo = new THREE.CylinderGeometry(4.2, 4.2, 1.4, 28);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd92d20, roughness: 0.4, metalness: 0.1 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.4, metalness: 0.1 });

    const stackPositions = [
      [-75, 0, -28],
      [-68, 0, -25],
      [-60, 0, -22],
      [-52, 0, -19],
      [-44, 0, -16],
      [-36, 0, -13],
      [-28, 0, -10],
    ];

    stackPositions.forEach((pos, stackIdx) => {
      const height = 6 + (stackIdx % 4) * 2;
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
    const chipGeo = new THREE.CylinderGeometry(5.2, 5.2, 1.6, 32);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3, metalness: 0.2 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(x, y, z);
    chip.castShadow = true;
    chip.receiveShadow = true;
    this.scene.add(chip);

    // White concentric ring
    const ringGeo = new THREE.RingGeometry(2.2, 3.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.81, z);
    this.scene.add(ring);
  }

  /**
   * Procedural Anatomical Model of the Fruit Fly (Drosophila melanogaster)
   */
  buildFlyModel() {
    this.flyGroup = new THREE.Group();
    // Position fly near the cards on the felt table
    this.flyGroup.position.set(-25, 9.5, -2);
    this.flyGroup.rotation.y = Math.PI * 0.15; // Angled facing the cards

    // Shared Chitin Materials
    const tanChitin = new THREE.MeshStandardMaterial({
      color: 0xc48c4d, // Drosophila light-tan cuticle
      roughness: 0.55,
      metalness: 0.15,
    });

    const darkTanChitin = new THREE.MeshStandardMaterial({
      color: 0x965d29,
      roughness: 0.6,
      metalness: 0.1,
    });

    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xba1a1a, // Brilliant ruby-red compound eyes
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x3d0707,
    });

    // 1. Thorax (Humpbacked central body)
    const thoraxGeo = new THREE.SphereGeometry(6.5, 20, 16);
    thoraxGeo.scale(1.0, 0.85, 1.25);
    const thorax = new THREE.Mesh(thoraxGeo, tanChitin);
    thorax.castShadow = true;
    this.flyGroup.add(thorax);

    // 2. Abdomen (Segmented, striped tapered tail)
    const abdomenGeo = new THREE.ConeGeometry(5.8, 16, 20);
    abdomenGeo.rotateX(Math.PI / 2);
    abdomenGeo.scale(1.0, 0.8, 1.0);
    this.abdomenMesh = new THREE.Mesh(abdomenGeo, darkTanChitin);
    this.abdomenMesh.position.set(0, 0.5, -11.5);
    this.abdomenMesh.rotation.x = -0.15; // Slightly arched downward
    this.abdomenMesh.castShadow = true;
    this.flyGroup.add(this.abdomenMesh);

    // 3. Head
    const headGeo = new THREE.SphereGeometry(4.2, 16, 14);
    headGeo.scale(1.15, 0.9, 0.85);
    const head = new THREE.Mesh(headGeo, tanChitin);
    head.position.set(0, 0.8, 7.2);
    head.castShadow = true;
    this.flyGroup.add(head);

    // Compound Eyes (Left & Right Lateral Hemispheres)
    const eyeGeo = new THREE.SphereGeometry(2.3, 16, 14);
    eyeGeo.scale(1.1, 1.2, 0.9);

    const eyeL = new THREE.Mesh(eyeGeo, eyeMaterial);
    eyeL.position.set(-3.2, 1.2, 7.4);
    eyeL.rotation.y = -0.4;
    eyeL.castShadow = true;
    this.flyGroup.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMaterial);
    eyeR.position.set(3.2, 1.2, 7.4);
    eyeR.rotation.y = 0.4;
    eyeR.castShadow = true;
    this.flyGroup.add(eyeR);

    // Antennae / Bristles
    const antGeo = new THREE.CylinderGeometry(0.12, 0.05, 3.2, 8);
    const antMat = new THREE.MeshBasicMaterial({ color: 0x332211 });

    const antL = new THREE.Mesh(antGeo, antMat);
    antL.position.set(-1.0, 2.5, 9.2);
    antL.rotation.set(-0.6, 0.3, -0.4);
    this.flyGroup.add(antL);

    const antR = new THREE.Mesh(antGeo, antMat);
    antR.position.set(1.0, 2.5, 9.2);
    antR.rotation.set(-0.6, -0.3, 0.4);
    this.flyGroup.add(antR);

    // 4. Translucent Iridescent Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(4, 8, 8, 20, 4, 28);
    wingShape.bezierCurveTo(0, 30, -6, 26, -5, 14);
    wingShape.bezierCurveTo(-4, 6, -2, 2, 0, 0);

    const wingGeo = new THREE.ShapeGeometry(wingShape);
    wingGeo.rotateX(-Math.PI / 2);
    wingGeo.scale(0.85, 1.0, 0.95);

    const wingMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.58,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.wingsMesh = new THREE.Group();

    const wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(-1.2, 4.8, -1.0);
    wingL.rotation.set(0.08, -0.15, -0.05);
    this.wingsMesh.add(wingL);

    const wingR = new THREE.Mesh(wingGeo, wingMat);
    wingR.position.set(1.2, 4.8, -1.0);
    wingR.rotation.set(0.08, 0.15, 0.05);
    this.wingsMesh.add(wingR);

    this.flyGroup.add(this.wingsMesh);

    // 5. Six Articulated Jointed Legs
    this.buildLegs();

    this.scene.add(this.flyGroup);
  }

  buildLegs() {
    const legMat = new THREE.MeshStandardMaterial({ color: 0x9b6732, roughness: 0.7, metalness: 0.1 });

    const createLegSegment = (length, r1 = 0.55, r2 = 0.4) => {
      const geo = new THREE.CylinderGeometry(r2, r1, length, 8);
      geo.translate(0, -length / 2, 0);
      const mesh = new THREE.Mesh(geo, legMat);
      mesh.castShadow = true;
      return mesh;
    };

    // Right Foreleg (This one performs the casino HIT tap gesture!)
    this.forelegPivotR = new THREE.Group();
    this.forelegPivotR.position.set(4.5, -0.5, 4.5);

    const femurR = createLegSegment(8.0, 0.65, 0.45);
    femurR.rotation.set(0.2, 0, -0.8);
    this.forelegPivotR.add(femurR);

    const tibiaPivotR = new THREE.Group();
    tibiaPivotR.position.set(6.0, -5.2, 1.2);
    const tibiaR = createLegSegment(9.5, 0.45, 0.3);
    tibiaR.rotation.set(-0.3, 0, 0.55);
    tibiaPivotR.add(tibiaR);
    this.forelegPivotR.add(tibiaPivotR);

    this.flyGroup.add(this.forelegPivotR);

    // Left Foreleg
    this.forelegPivotL = new THREE.Group();
    this.forelegPivotL.position.set(-4.5, -0.5, 4.5);

    const femurL = createLegSegment(8.0, 0.65, 0.45);
    femurL.rotation.set(0.2, 0, 0.8);
    this.forelegPivotL.add(femurL);

    const tibiaPivotL = new THREE.Group();
    tibiaPivotL.position.set(-6.0, -5.2, 1.2);
    const tibiaL = createLegSegment(9.5, 0.45, 0.3);
    tibiaL.rotation.set(-0.3, 0, -0.55);
    tibiaPivotL.add(tibiaL);
    this.forelegPivotL.add(tibiaPivotL);

    this.flyGroup.add(this.forelegPivotL);

    // Middle & Hind Legs (Stably resting on the felt)
    const legConfigs = [
      { x: 5.5, z: 0.0, fRot: [-0.1, 0, -1.0], tPos: [6.8, -4.5, -0.5], tRot: [0.2, 0, 0.65] },
      { x: -5.5, z: 0.0, fRot: [-0.1, 0, 1.0], tPos: [-6.8, -4.5, -0.5], tRot: [0.2, 0, -0.65] },
      { x: 5.0, z: -4.8, fRot: [-0.6, 0, -0.85], tPos: [5.8, -4.8, -4.2], tRot: [0.5, 0, 0.6] },
      { x: -5.0, z: -4.8, fRot: [-0.6, 0, 0.85], tPos: [-5.8, -4.8, -4.2], tRot: [0.5, 0, -0.6] },
    ];

    legConfigs.forEach((cfg) => {
      const pivot = new THREE.Group();
      pivot.position.set(cfg.x, -0.8, cfg.z);

      const femur = createLegSegment(8.5, 0.65, 0.45);
      femur.rotation.set(cfg.fRot[0], cfg.fRot[1], cfg.fRot[2]);
      pivot.add(femur);

      const tibiaPivot = new THREE.Group();
      tibiaPivot.position.set(cfg.tPos[0], cfg.tPos[1], cfg.tPos[2]);
      const tibia = createLegSegment(10.5, 0.45, 0.3);
      tibia.rotation.set(cfg.tRot[0], cfg.tRot[1], cfg.tRot[2]);
      tibiaPivot.add(tibia);
      pivot.add(tibiaPivot);

      this.flyGroup.add(pivot);
    });
  }

  /**
   * Spawns or updates playing cards in 3D on the green felt.
   */
  renderCards(playerCards, dealerCards) {
    // Clear old cards
    this.cardMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.cardMeshes = [];

    // 1. Render Fly's Cards (Close to the fly)
    playerCards.forEach((val, idx) => {
      const card = this.create3DCard(val, false);
      // Stagger slightly side-by-side
      card.position.set(2.0 + idx * 8.5, 0.4 + idx * 0.08, -6.0 + idx * 1.8);
      card.rotation.y = -0.05 * idx;
      this.scene.add(card);
      this.cardMeshes.push(card);
    });

    // 2. Render Dealer Cards (Upper section)
    dealerCards.forEach((val, idx) => {
      const isHidden = val === "HIDDEN";
      const card = this.create3DCard(val, isHidden);
      card.position.set(2.0 + idx * 8.5, 0.4 + idx * 0.08, -32.0 + idx * 1.8);
      this.scene.add(card);
      this.cardMeshes.push(card);
    });
  }

  create3DCard(val, isHidden) {
    const cardGeo = new THREE.BoxGeometry(11.0, 0.2, 15.0);

    // Front texture: Suit & Rank
    const frontCanvas = document.createElement("canvas");
    frontCanvas.width = 256;
    frontCanvas.height = 356;
    const ctx = frontCanvas.getContext("2d");

    if (isHidden) {
      // Pink/Red Lattice Pattern matching reference image!
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

      // Large central suit
      ctx.font = "96px Arial";
      ctx.textAlign = "center";
      ctx.fillText(suit, 128, 210);
    }

    const frontTex = new THREE.CanvasTexture(frontCanvas);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.35 });

    // Box faces: [right, left, top, bottom, front, back]
    // Top face is index 2 (Y+)
    const materials = [edgeMat, edgeMat, frontMat, edgeMat, edgeMat, edgeMat];
    const mesh = new THREE.Mesh(cardGeo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Triggers the Fly's Physical "HIT" Action (Foreleg Table Tap)
   */
  triggerForelegTap(onComplete) {
    this.isTapping = true;
    this.tapProgress = 0.0;
    this.onTapComplete = onComplete;
  }

  /**
   * Triggers the Fly's Physical "STAND" Action (Bilateral Wave)
   */
  triggerForelegWave(onComplete) {
    this.isWaving = true;
    this.waveProgress = 0.0;
    this.onWaveComplete = onComplete;
  }

  animate() {
    requestAnimationFrame(this.animate);
    const elapsed = this.animationClock.getElapsedTime();

    // 1. Subtle idle biological motions
    if (this.wingsMesh) {
      this.wingsMesh.rotation.z = Math.sin(elapsed * 4.0) * 0.015;
    }
    if (this.abdomenMesh) {
      this.abdomenMesh.rotation.x = -0.15 + Math.sin(elapsed * 2.5) * 0.02;
    }

    // 2. Foreleg Tap Animation (Casino HIT)
    if (this.isTapping && this.forelegPivotR) {
      this.tapProgress += 0.045;
      // Double tap wave: 2 sinusoids
      const angle = Math.sin(this.tapProgress * Math.PI * 2.0);
      if (this.tapProgress < 1.0) {
        this.forelegPivotR.rotation.x = Math.max(0, -angle * 0.55);
        this.forelegPivotR.position.y = -0.5 + Math.max(0, angle * 2.2);
      } else {
        this.isTapping = false;
        this.forelegPivotR.rotation.x = 0;
        this.forelegPivotR.position.y = -0.5;
        if (this.onTapComplete) this.onTapComplete();
      }
    }

    // 3. Foreleg Wave Animation (Casino STAND)
    if (this.isWaving && this.forelegPivotR && this.forelegPivotL) {
      this.waveProgress += 0.035;
      const waveAngle = Math.sin(this.waveProgress * Math.PI * 3.0);
      if (this.waveProgress < 1.0) {
        this.forelegPivotR.rotation.z = -waveAngle * 0.45;
        this.forelegPivotL.rotation.z = waveAngle * 0.45;
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
