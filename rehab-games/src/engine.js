import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createHands, HAND_DEFAULTS } from './hand.js';
import { EpochScheduler, MarkerSink, DEFAULT_TIMING, PHASES } from './epoch.js';
import { HUD_CSS } from './hud-css.js';

const SCENE_DEFAULTS = {
  fogColor: 0x0a1418, fogDensity: 0.03,
  skyTop: 0x0d2030, skyMid: 0x0a1620, skyBottom: 0x050a0d,
  sunColor: 0xbfd8ff, sunIntensity: 1.2, sunPosition: [-5, 14, -6],
  ambientSky: 0x4a6a80, ambientGround: 0x1a2018, ambientIntensity: 1.1,
  fillColor: 0x2a4050, fillIntensity: 0.7,
  exposure: 1.15, fov: 55, near: 0.05, far: 180, cameraPitch: -0.12,
  environmentIntensity: 0.9,
  keyLightColor: 0xffffff, keyLightIntensity: 0.0, keyLightDistance: 2.0,
  shadows: true,
};

const POSTFX_DEFAULTS = { bloomStrength: 0.5, bloomRadius: 0.55, bloomThreshold: 0.82 };

function gradientEnvironment(renderer, cfg) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(cfg.skyTop) },
      midColor: { value: new THREE.Color(cfg.skyMid) },
      bottomColor: { value: new THREE.Color(cfg.skyBottom) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vPos; uniform vec3 topColor, midColor, bottomColor;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        vec3 c = h > 0.55 ? mix(midColor, topColor, (h-0.55)/0.45) : mix(bottomColor, midColor, h/0.55);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 24), mat));
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  mat.dispose();
  return target.texture;
}

function buildScene(canvas, cfg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.exposure;
  if (cfg.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
  scene.background = new THREE.Color(cfg.fogColor);
  scene.environment = gradientEnvironment(renderer, cfg);
  scene.environmentIntensity = cfg.environmentIntensity;

  const camera = new THREE.PerspectiveCamera(cfg.fov, window.innerWidth / window.innerHeight, cfg.near, cfg.far);
  camera.rotation.x = cfg.cameraPitch;
  scene.add(camera);

  const sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
  sun.position.set(...cfg.sunPosition);
  if (cfg.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
    sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    sun.shadow.bias = -0.0015;
  }
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(cfg.ambientSky, cfg.ambientGround, cfg.ambientIntensity));

  const fill = new THREE.PointLight(cfg.fillColor, cfg.fillIntensity, 20, 2);
  fill.position.set(0, 1.4, 2.2);
  scene.add(fill);

  if (cfg.keyLightIntensity > 0) {
    const key = new THREE.PointLight(cfg.keyLightColor, cfg.keyLightIntensity, cfg.keyLightDistance, 2);
    key.position.set(0, 0.06, -0.10);
    camera.add(key);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, sun };
}

/**
 * Photodiode patch, drawn as a WebGL overlay rather than a DOM element so it
 * is guaranteed to land in the same presented frame as the 3D scene. Tape a
 * photodiode over this square and feed it into a spare amplifier channel: it
 * is the only way to measure your true cue-to-photon latency instead of
 * assuming it.
 */
function createPhotodiode(corner = "top-left", sizePx = 88) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  quad.position.set(0.5, 0.5, 0);
  scene.add(quad);
  let litUntil = 0;

  return {
    enabled: true,
    flash(durationMs = 100) { litUntil = performance.now() + durationMs; },
    render(renderer) {
      if (!this.enabled) return;
      const w = renderer.domElement.clientWidth || window.innerWidth;
      const h = renderer.domElement.clientHeight || window.innerHeight;
      const fx = sizePx / w, fy = sizePx / h;
      quad.scale.set(fx, fy, 1);
      const x = corner.includes('left') ? fx / 2 : 1 - fx / 2;
      const y = corner.includes('top') ? 1 - fy / 2 : fy / 2;
      quad.position.set(x, y, 0);
      mat.color.setScalar(performance.now() < litUntil ? 1 : 0);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
    },
  };
}

class Audio {
  constructor() { this.ctx = null; this.on = false; }
  enable() {
    if (this.ctx) { this.on = true; return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.on = true; } catch (e) { this.on = false; }
  }
  tone(freq = 440, dur = 0.25, gain = 0.06, type = 'sine') {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  chime() { this.tone(660, 0.5, 0.05); this.tone(990, 0.4, 0.025); }
  soft() { this.tone(330, 0.35, 0.035, 'triangle'); }
}

function buildHUD(cfg) {
  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'app';
  root.innerHTML = `
    <canvas id="scene"></canvas>
    <div id="vignette"></div>

    <div id="loading"><div class="ring"></div><div class="t">${cfg.loadingLabel || 'Loading'}</div><div class="s">${cfg.loadingSub || ''}</div></div>

    <div id="intro" role="dialog" aria-label="Session setup">
      <div class="card">
        <h1>${cfg.title}</h1>
        <p>${cfg.tagline}</p>
        <div class="proto">
          <span>Rest 2.0s</span><span>Cue 0.5s</span><span>Flex 1.5s</span>
          <span>Hold 2.5s</span><span>Extend 1.5s</span><span>Rest 4.0s</span>
        </div>
        <div class="row">
          <label>Trials <input id="opt-trials" type="number" min="4" max="400" step="4" value="40" /></label>
          <label>Marker socket <input id="opt-ws" type="text" placeholder="ws://localhost:8765" /></label>
        </div>
        <div class="row checks">
          <label><input type="checkbox" id="opt-photodiode" checked /> Photodiode patch</label>
          <label><input type="checkbox" id="opt-fixation" checked /> Fixation point</label>
          <label><input type="checkbox" id="opt-sound" /> Cue tone</label>
        </div>
        <button id="start-btn">Begin session</button>
        <p class="fine">Movement is open-loop: the hand flexes on the timeline regardless of input. Nothing here is scored and nothing can fail.</p>
      </div>
    </div>

    <div id="summary"><div class="card">
      <h1>Session complete</h1>
      <p id="summary-text"></p>
      <button id="csv-btn">Download markers (CSV)</button>
      <button id="restart-btn" class="ghost">Run again</button>
    </div></div>

    <div class="hud">
      <div id="topbar">
        <div class="pill"><span id="trial-text">—</span></div>
        <div class="pill" id="ws-pill" hidden>markers <span id="ws-state">—</span></div>
        <div class="pill"><span id="phase-text">—</span></div>
      </div>
      <div id="fixation"></div>
      <div id="cue"><span id="cue-text"></span></div>
      <div id="phasebar"><div id="phasebar-fill"></div></div>
    </div>`;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  return {
    el: {
      canvas: $('scene'), loading: $('loading'), intro: $('intro'), summary: $('summary'),
      summaryText: $('summary-text'), startBtn: $('start-btn'), restartBtn: $('restart-btn'),
      csvBtn: $('csv-btn'), trials: $('opt-trials'), ws: $('opt-ws'),
      photodiode: $('opt-photodiode'), fixation: $('opt-fixation'), sound: $('opt-sound'),
      trialText: $('trial-text'), phaseText: $('phase-text'), cue: $('cue'), cueText: $('cue-text'),
      fixationDot: $('fixation'), phasebar: $('phasebar-fill'), wsPill: $('ws-pill'), wsState: $('ws-state'),
    },
    showError(err) {
      console.error(err);
      const t = $('loading').querySelector('.t'), s = $('loading').querySelector('.s'), r = $('loading').querySelector('.ring');
      if (r) r.style.display = 'none';
      if (t) t.textContent = 'Could not start';
      if (s) { s.textContent = (err && (err.message || String(err))) || 'Unknown error'; s.style.color = '#ff9a8a'; s.style.maxWidth = '80vw'; }
    },
  };
}

export function launch(config) {
  const run = () => start(config);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}

function start(config) {
  const hud = buildHUD(config.hud);
  const fail = (e) => hud.showError(e);
  window.addEventListener('error', (e) => fail(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fail(e.reason));

  try {
    const sceneCfg = { ...SCENE_DEFAULTS, ...(config.scene || {}) };
    const fxCfg = { ...POSTFX_DEFAULTS, ...(config.postfx || {}) };

    const { renderer, scene, camera, sun } = buildScene(hud.el.canvas, sceneCfg);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      fxCfg.bloomStrength, fxCfg.bloomRadius, fxCfg.bloomThreshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    window.addEventListener('resize', () => {
      composer.setSize(window.innerWidth, window.innerHeight);
      bloom.setSize(window.innerWidth, window.innerHeight);
    });

    const handRig = createHands(camera, { ...HAND_DEFAULTS, ...(config.hands || {}) });
    const photodiode = createPhotodiode(config.photodiodeCorner || 'top-left');
    const audio = new Audio();

    const theme = config.create({ scene, camera, renderer, sun, handRig, audio, bloom });

    let scheduler = null;
    let markers = null;

    const setPhaseUI = (phase, side) => {
      hud.el.phaseText.textContent = phase.toUpperCase();
      const showCue = phase === 'cue' || phase === 'flex' || phase === 'hold' || phase === 'extend';
      hud.el.cue.classList.toggle('visible', showCue);
      if (phase === 'cue') hud.el.cueText.textContent = side === 'left' ? 'LEFT' : 'RIGHT';
    };

    hud.el.startBtn.addEventListener('click', () => {
      hud.el.intro.classList.add('hidden');
      photodiode.enabled = hud.el.photodiode.checked;
      hud.el.fixationDot.style.display = hud.el.fixation.checked ? 'block' : 'none';
      if (hud.el.sound.checked) audio.enable();

      const wsUrl = hud.el.ws.value.trim();
      markers = new MarkerSink({
        url: wsUrl,
        onStatus: (s) => { hud.el.wsPill.hidden = false; hud.el.wsState.textContent = s; },
      });

      const trials = Math.max(4, Math.min(400, parseInt(hud.el.trials.value, 10) || 40));

      scheduler = new EpochScheduler({
        timing: { ...DEFAULT_TIMING, ...(config.timing || {}) },
        trials,
        markers,
        onTrial: (i, side) => {
          hud.el.trialText.textContent = `Trial ${i + 1} / ${trials}`;
          theme.onTrial?.(i, side);
        },
        onPhase: (phase, ctx) => {
          setPhaseUI(phase, ctx.side);
          // Flash the patch on the two boundaries that matter for epoching.
          if (phase === 'cue' || phase === 'flex') photodiode.flash(100);
          if (phase === 'cue' && hud.el.sound.checked) audio.soft();
          theme.onPhase?.(phase, ctx);
        },
        onFinish: () => {
          hud.el.cue.classList.remove('visible');
          hud.el.phaseText.textContent = 'DONE';
          hud.el.summaryText.textContent =
            `${trials} trials, ${markers.rows.length} markers recorded. ` +
            `Each trial ran rest → cue → flex → hold → extend → rest on the fixed timeline.`;
          hud.el.summary.classList.add('visible');
          theme.onFinish?.();
        },
      });

      theme.start?.();
      scheduler.start();
    });

    hud.el.csvBtn.addEventListener('click', () => markers?.download(`${(config.hud.title || 'session').toLowerCase().replace(/\s+/g, '-')}-markers.csv`));
    hud.el.restartBtn.addEventListener('click', () => window.location.reload());

    const clock = new THREE.Clock();
    const loop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      if (scheduler) {
        scheduler.update(dt);
        const side = scheduler.side;
        handRig.setCurl(side, scheduler.curl);
        handRig.setCurl(side === 'left' ? 'right' : 'left', 0);
        hud.el.phasebar.style.transform = `scaleX(${scheduler.phaseProgress})`;
        theme.update?.(dt, t, {
          phase: scheduler.phase, progress: scheduler.phaseProgress,
          side, curl: scheduler.curl, trial: scheduler.trial,
        });
      } else {
        theme.update?.(dt, t, { phase: 'idle', progress: 0, side: 'left', curl: 0, trial: -1 });
      }

      handRig.update(t);
      composer.render();
      photodiode.render(renderer);
      requestAnimationFrame(loop);
    };

    // Compile everything before the first trial so no shader hitch lands on a
    // phase boundary and skews the marker timing.
    renderer.compile(scene, camera);
    requestAnimationFrame(() => {
      hud.el.loading.classList.add('hidden');
      loop();
    });
  } catch (e) {
    fail(e);
  }
}

export { PHASES };
