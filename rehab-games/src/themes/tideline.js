import * as THREE from 'three';
import { createMotes, fbm, makeRng, easeOut, easeInOut } from '../world.js';
import { TrialProp } from './common.js';

/**
 * Tide Line — a wave washes a shell into the cupped palm, recedes while it is
 * held, and the next wave takes it back.
 *
 * The wave cycle is driven off the trial clock, so the 12-second loop reads as
 * the sea's own rhythm rather than a metronome laid over the scene.
 *
 * The sun sits high and ahead rather than low on the horizon: it keeps the two
 * hands lit identically (a lateral source would bias one side) without putting
 * a glare disc directly behind them.
 */
export default {
  hud: {
    title: 'Tide Line',
    tagline: 'You are knelt at the water’s edge, hands open on the wet sand. A wave washes a shell into one palm — when the cue comes, imagine closing that hand. The water draws back while you hold, and the next wave takes the shell as your fingers open.',
    loadingLabel: 'Low tide',
    loadingSub: 'Letting the water in…',
  },
  scene: {
    fogColor: 0xb6bfc2, fogDensity: 0.0065,
    skyTop: 0x2f5f8c, skyMid: 0x7d9db4, skyBottom: 0xe0c3a0,
    sunColor: 0xffeccc, sunIntensity: 2.2, sunPosition: [0, 20, -40],
    ambientSky: 0x93b4cf, ambientGround: 0x7d6b55, ambientIntensity: 0.95,
    fillColor: 0xffe0bc, fillIntensity: 0.35,
    keyLightColor: 0xfff0dc, keyLightIntensity: 0.02, keyLightDistance: 1.6,
    exposure: 0.95, fov: 55, far: 300, cameraPitch: -0.23,
    environmentIntensity: 0.6,
  },
  postfx: { bloomStrength: 0.26, bloomRadius: 0.7, bloomThreshold: 0.92 },
  hands: { skinColor: 0xb47f64, sleeveColor: 0x474439 },

  create({ scene, handRig, audio }) {
    // --- Beach: flat near the knees, sloping away to the waterline ---
    const SAND_Y = -1.02;
    const SLOPE = 0.038;
    const sandHeight = (x, z) => {
      const away = Math.max(0, -z);
      const ripple = (fbm(x * 0.35, z * 0.12, 3) - 0.5) * 0.045
                   + Math.sin(z * 1.4 + x * 0.2) * 0.012;
      return SAND_Y - away * SLOPE + ripple;
    };

    const sandGeo = new THREE.PlaneGeometry(120, 120, 220, 220);
    sandGeo.rotateX(-Math.PI / 2);
    sandGeo.translate(0, 0, -56);
    {
      const pos = sandGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, sandHeight(pos.getX(i), pos.getZ(i)));
      sandGeo.computeVertexNormals();
    }
    const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({
      color: 0xbca884, roughness: 0.93, metalness: 0.0,
    }));
    sand.receiveShadow = true;
    scene.add(sand);

    // --- Sea, beginning well past the waterline ---
    const WATER_Y = SAND_Y - 8.6 * SLOPE;
    const seaUniforms = { uTime: { value: 0 } };
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x1d4c63, roughness: 0.26, metalness: 0.04, envMapIntensity: 0.65,
    });
    seaMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = seaUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n uniform float uTime; varying vec3 vW;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          transformed.y += sin(wp.z * 0.42 + uTime * 1.2) * 0.13
                         + sin(wp.x * 0.27 - uTime * 0.85) * 0.08
                         + sin((wp.x + wp.z) * 0.85 + uTime * 1.9) * 0.03;
          vW = wp;`);
      sh.fragmentShader = sh.fragmentShader
        // uTime has to be declared in the fragment stage too — the vertex
        // declaration does not carry over, and the program silently fails to
        // link without it.
        .replace('#include <common>', `#include <common>\n uniform float uTime; varying vec3 vW;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // Breakers: a band of white water where the sea meets the slope.
          float band = smoothstep(-26.0, -9.5, vW.z);
          float lace = sin(vW.x * 2.1 + uTime * 1.6) * 0.5 + 0.5;
          float foam = band * (0.35 + lace * 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), foam * 0.75);`);
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 240, 260, 200), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, WATER_Y, -128);
    scene.add(sea);

    // --- The surge: a sheet of water that runs up the sand and back ---
    const surgeUniforms = { uTime: { value: 0 }, uEdge: { value: -9.0 } };
    const surgeGeo = new THREE.PlaneGeometry(40, 13, 160, 90);
    surgeGeo.rotateX(-Math.PI / 2);
    surgeGeo.translate(0, 0, -6.1);
    {
      const pos = surgeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, sandHeight(pos.getX(i), pos.getZ(i)) + 0.013);
      surgeGeo.computeVertexNormals();
    }
    const surgeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: surgeUniforms,
      vertexShader: `
        uniform float uTime; varying vec3 vW;
        void main(){
          vec3 p = position;
          vW = (modelMatrix * vec4(p,1.0)).xyz;
          p.y += sin(vW.x * 3.0 + uTime * 3.4) * 0.006;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uEdge; varying vec3 vW;
        void main(){
          // Alpha falls off in front of the advancing edge; a brighter lace of
          // foam rides right on it.
          float body = smoothstep(uEdge + 0.05, uEdge - 1.3, vW.z);
          float wob  = sin(vW.x * 2.6 + uTime * 2.2) * 0.13
                     + sin(vW.x * 6.1 - uTime * 1.5) * 0.06;
          float edge = uEdge + wob;
          float lip  = smoothstep(edge + 0.02, edge - 0.30, vW.z)
                     * (1.0 - smoothstep(edge - 0.30, edge - 0.85, vW.z));
          vec3 water = vec3(0.14, 0.31, 0.38);
          vec3 foam  = vec3(0.95, 0.97, 0.97);
          vec3 col = mix(water, foam, clamp(lip * 1.5, 0.0, 1.0));
          float a = clamp(body * 0.66 + lip * 0.80, 0.0, 0.96);
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const surge = new THREE.Mesh(surgeGeo, surgeMat);
    scene.add(surge);

    // Wet-sand sheen left behind by the last wave.
    const wet = new THREE.Mesh(
      surgeGeo.clone(),
      new THREE.MeshStandardMaterial({
        color: 0x8f7d63, roughness: 0.28, metalness: 0.0,
        transparent: true, opacity: 0.55, depthWrite: false,
      })
    );
    wet.position.y -= 0.004;
    scene.add(wet);

    // Scattered stones, kept off the midline so they never sit behind a hand.
    {
      const rng = makeRng(29);
      const inst = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.9, flatShading: true }),
        22
      );
      const m = new THREE.Object3D();
      for (let i = 0; i < 22; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (1.6 + rng() * 9);
        const z = -1.5 - rng() * 12;
        const s = 0.07 + rng() * 0.22;
        m.position.set(x, sandHeight(x, z) + s * 0.35, z);
        m.rotation.set(rng() * 3, rng() * 6, rng() * 3);
        m.scale.set(s, s * 0.6, s * 0.85);
        m.updateMatrix();
        inst.setMatrixAt(i, m.matrix);
      }
      inst.receiveShadow = true;
      scene.add(inst);
    }

    const spray = createMotes(scene, {
      count: 120, box: 24, color: [1, 0.99, 0.96], size: 1.8,
      rise: 0.1, opacity: 0.14, sway: 1.2, blending: THREE.NormalBlending,
    });

    /** A tapering logarithmic spiral swept into a tube: a small conch. */
    function buildShell() {
      const pts = [];
      const turns = 3.05;
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const a = t * Math.PI * 2 * turns;
        const r = 0.0044 * Math.exp(t * 1.72);
        pts.push(new THREE.Vector3(Math.cos(a) * r, t * 0.019 - 0.0095, Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 150, 0.0066, 14, false);
      // Taper from the apex out to the aperture so it reads as a shell rather
      // than a coiled rope.
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      const ring = 15;
      for (let i = 0; i < pos.count; i++) {
        const seg = Math.floor(i / ring) / 150;
        const k = 0.20 + Math.pow(seg, 1.32) * 1.6;
        v.fromBufferAttribute(pos, i);
        const c = curve.getPoint(Math.min(0.999, seg));
        v.sub(c).multiplyScalar(k).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();

      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xead2b6, roughness: 0.36, metalness: 0.0,
        clearcoat: 0.9, clearcoatRoughness: 0.12,
        sheen: 0.55, sheenColor: new THREE.Color(0xffcdb0), sheenRoughness: 0.4,
        envMapIntensity: 1.25,
      });
      // Growth banding across the whorls — without it the shell reads as a
      // smooth plastic curl at this size.
      mat.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\n varying vec2 vShellUv;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
            float band = sin(vShellUv.x * 128.0) * 0.5 + 0.5;
            float wide = sin(vShellUv.x * 19.0) * 0.5 + 0.5;
            diffuseColor.rgb *= 0.80 + 0.20 * band;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.40, 0.30), wide * 0.22);`);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>\n varying vec2 vShellUv;`)
          .replace('#include <uv_vertex>', `#include <uv_vertex>\n vShellUv = uv;`);
      };
      const shell = new THREE.Mesh(geo, mat);
      shell.castShadow = true;
      const g = new THREE.Group();
      g.add(shell);
      g.rotation.set(0.55, 0.4, 0.22);
      g.userData = { mat, shell };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildShell, dropHeight: 0.11, drift: 0.10 });
    let phase = 'rest';
    const EDGE_OUT = -9.0;   // water fully withdrawn
    const EDGE_IN = -0.12;   // water right at the hands
    let waveTarget = 0;

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'cue') audio.tone(300, 0.5, 0.03, 'triangle');
        else if (p === 'flex') prop.grasp();
        else if (p === 'extend') { prop.beginDepart(); audio.tone(280, 0.55, 0.03, 'triangle'); }
        else if (p === 'iti') prop.dispose();
      },

      update(dt, t, s) {
        seaUniforms.uTime.value = t;
        surgeUniforms.uTime.value = t;
        spray.update(t);

        // The sea runs on the trial clock: in on the cue, out through the hold,
        // back in as the hand opens.
        if (phase === 'cue') waveTarget = easeOut(s.progress);
        else if (phase === 'flex') waveTarget = 1 - s.progress * 0.30;
        else if (phase === 'hold') waveTarget = 0.70 - easeInOut(s.progress) * 0.68;
        else if (phase === 'extend') waveTarget = 0.02 + easeInOut(s.progress) * 0.96;
        else if (phase === 'iti') waveTarget = Math.max(0, 0.98 - s.progress * 1.25);
        else waveTarget = 0;

        const eased = THREE.MathUtils.damp(
          (surgeUniforms.uEdge.value - EDGE_OUT) / (EDGE_IN - EDGE_OUT), waveTarget, 5, dt
        );
        surgeUniforms.uEdge.value = EDGE_OUT + eased * (EDGE_IN - EDGE_OUT);
        wet.material.opacity = 0.25 + eased * 0.35;

        const o = prop.obj;
        if (!o) return;

        if (phase === 'rest') {
          // Carried in on the surge rather than dropped from above.
          prop.descend(s.progress, 0.010, t);
          o.rotation.y += dt * 1.9;
          o.rotation.z = 0.22 + Math.sin(t * 4) * 0.18 * (1 - s.progress);
        } else if (phase === 'cue') {
          o.rotation.y += dt * 0.5;
        } else if (phase === 'flex') {
          o.rotation.z += (0.22 - o.rotation.z) * Math.min(1, dt * 4);
          o.rotation.y += dt * 0.25;
        } else if (phase === 'hold') {
          // Wet and drying: the film of seawater dulls off over the hold.
          const dry = easeOut(s.progress);
          o.userData.mat.clearcoat = 0.95 - dry * 0.55;
          o.userData.mat.clearcoatRoughness = 0.10 + dry * 0.28;
          o.userData.mat.roughness = 0.32 + dry * 0.16;
          o.rotation.y += dt * 0.16;
        } else if (phase === 'extend') {
          // The returning wave floats it off the palm.
          prop.depart(s.progress, { rise: 0.04, sway: 0.12, time: t });
          o.position.z -= dt * 0.18;
          o.rotation.y += dt * 1.1;
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
