/**
 * visualizer3d.js
 * ===============
 * Three.js WebGL 3D Point-Cloud Visualizer for the Drosophila (fruit fly) Connectome.
 * Features dynamic spike wave propagation, neuropil color segmentation, and orbit controls.
 */

class ConnectomeVisualizer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Three.js Core
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050811, 0.0012);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 1, 3000);
    this.camera.position.set(0, 150, 480);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.0;
    this.controls.maxDistance = 1200;
    this.controls.minDistance = 50;

    // Neuron Particle System
    this.particleSystem = null;
    this.geometry = null;
    this.colorsArray = null;
    this.baseColors = null;
    this.activityLevels = null; // Decays over time

    // Neuropil Palette (RGB 0..1)
    this.neuropilColors = {
      Antennal_Lobe_Sensory: new THREE.Color(0x06b6d4), // Cyan
      Mushroom_Body: new THREE.Color(0xa855f7),         // Purple
      Central_Complex: new THREE.Color(0x10b981),       // Emerald
      Protocerebrum: new THREE.Color(0x38bdf8),         // Sky Blue
      Descending_Motor: new THREE.Color(0xf59e0b),      // Amber
      Default: new THREE.Color(0x64748b),               // Slate
    };

    this.activeSpikeColor = new THREE.Color(0xffffff);  // Brilliant white spike burst

    this.initLights();
    this.setupResize();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x38bdf8, 1.5, 800);
    pointLight.position.set(0, 200, 200);
    this.scene.add(pointLight);
  }

  setupResize() {
    window.addEventListener("resize", () => {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    });
  }

  loadConnectome(metadata) {
    const coords = metadata.coordinates;
    const n = coords.length;
    const neuropils = metadata.neuropil_labels;

    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    this.colorsArray = new Float32Array(n * 3);
    this.baseColors = new Float32Array(n * 3);
    this.activityLevels = new Float32Array(n);

    // Map each neuron to its neuropil color
    const neuronColorMap = new Array(n).fill(this.neuropilColors.Default);
    for (const [name, indices] of Object.entries(neuropils)) {
      const color = this.neuropilColors[name] || this.neuropilColors.Default;
      for (const idx of indices) {
        if (idx < n) neuronColorMap[idx] = color;
      }
    }

    for (let i = 0; i < n; i++) {
      // 3D coordinates: center the fly brain
      positions[i * 3 + 0] = coords[i][0];
      positions[i * 3 + 1] = coords[i][1];
      positions[i * 3 + 2] = coords[i][2];

      const c = neuronColorMap[i];
      this.colorsArray[i * 3 + 0] = c.r;
      this.colorsArray[i * 3 + 1] = c.g;
      this.colorsArray[i * 3 + 2] = c.b;

      this.baseColors[i * 3 + 0] = c.r;
      this.baseColors[i * 3 + 1] = c.g;
      this.baseColors[i * 3 + 2] = c.b;

      this.activityLevels[i] = 0.0;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colorsArray, 3));

    // Particle Material with Soft Glow Point Texture
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.3, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.7, "rgba(56,189,248,0.2)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    if (this.particleSystem) {
      this.scene.remove(this.particleSystem);
    }

    this.particleSystem = new THREE.Points(this.geometry, material);
    this.scene.add(this.particleSystem);

    console.log(`[Ty::WebGL] Successfully loaded ${n} Drosophila connectome neurons into 3D space.`);
  }

  triggerSpikeBurst(spikingEvents) {
    if (!this.activityLevels) return;

    // spikingEvents is a sequence of active index arrays over time
    let step = 0;
    const interval = setInterval(() => {
      if (step >= spikingEvents.length) {
        clearInterval(interval);
        return;
      }
      const activeIndices = spikingEvents[step];
      for (let i = 0; i < activeIndices.length; i++) {
        const idx = activeIndices[i];
        if (idx < this.activityLevels.length) {
          this.activityLevels[idx] = 1.0; // Max brightness pulse
        }
      }
      step++;
    }, 16); // 60 FPS burst playback
  }

  triggerBiologicalWave() {
    if (!this.activityLevels || !this.geometry) return;
    const positions = this.geometry.attributes.position.array;
    const n = this.activityLevels.length;

    // Biological wave traveling along the anterior-posterior axis (Y: -100 to +80)
    // and then down to descending neurons (Z: -110)
    let yStep = -120.0;
    const interval = setInterval(() => {
      if (yStep > 100.0) {
        clearInterval(interval);
        return;
      }

      for (let i = 0; i < n; i++) {
        const py = positions[i * 3 + 1];
        if (Math.abs(py - yStep) < 30.0) {
          this.activityLevels[i] = Math.min(1.0, this.activityLevels[i] + 0.85);
        }
      }
      yStep += 20.0;
    }, 25);
  }

  setCameraView(viewName) {
    switch (viewName) {
      case "frontal": // View antennal / olfactory lobes
        this.camera.position.set(0, -300, -80);
        this.controls.target.set(0, 0, -30);
        break;
      case "dorsal": // View mushroom body / Kenyon cells
        this.camera.position.set(0, 380, 50);
        this.controls.target.set(0, 0, 0);
        break;
      case "sagittal": // Side profile view
        this.camera.position.set(400, 20, 0);
        this.controls.target.set(0, 0, 0);
        break;
      case "reset":
      default:
        this.camera.position.set(0, 150, 480);
        this.controls.target.set(0, 0, 0);
        break;
    }
    this.controls.update();
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.particleSystem && this.activityLevels && this.geometry) {
      const colors = this.geometry.attributes.color.array;
      const n = this.activityLevels.length;
      let hasUpdates = false;

      for (let i = 0; i < n; i++) {
        let act = this.activityLevels[i];
        if (act > 0.005) {
          // Exponential decay
          act *= 0.88;
          this.activityLevels[i] = act;

          const baseR = this.baseColors[i * 3 + 0];
          const baseG = this.baseColors[i * 3 + 1];
          const baseB = this.baseColors[i * 3 + 2];

          // Blend from base color to white spike burst
          colors[i * 3 + 0] = baseR + (1.0 - baseR) * act;
          colors[i * 3 + 1] = baseG + (1.0 - baseG) * act;
          colors[i * 3 + 2] = baseB + (1.0 - baseB) * act;
          hasUpdates = true;
        } else if (act > 0) {
          this.activityLevels[i] = 0.0;
          colors[i * 3 + 0] = this.baseColors[i * 3 + 0];
          colors[i * 3 + 1] = this.baseColors[i * 3 + 1];
          colors[i * 3 + 2] = this.baseColors[i * 3 + 2];
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        this.geometry.attributes.color.needsUpdate = true;
      }

      // Subtle resting biological rotation
      this.particleSystem.rotation.y += 0.001;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.ConnectomeVisualizer3D = ConnectomeVisualizer3D;
