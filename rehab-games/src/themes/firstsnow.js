import * as THREE from 'three';
import { createTerrain, createMotes, createTrees, easeOut } from '../world.js';
import { TrialProp } from './common.js';

/**
 * First Snow — a single crystal settles on the palm, and melts while held.
 *
 * The melt is deliberate: it turns the 2.5s hold into something the patient
 * can read without a UI element, and it leaves a droplet for the hand to let
 * go of on extend.
 */
export default {
  hud: {
    title: 'First Snow',
    tagline: 'A single flake settles on your open hand. When the cue comes, imagine closing that hand — the fingers will close, and the flake will melt in your palm while you hold. Then they open and the drop falls.',
    loadingLabel: 'Still air',
    loadingSub: 'Letting the snow settle…',
  },
  scene: {
    fogColor: 0xadc3d4, fogDensity: 0.018,
    skyTop: 0x5b83a8, skyMid: 0x9fbcd2, skyBottom: 0xcbdae4,
    sunColor: 0xfff4e2, sunIntensity: 2.4, sunPosition: [0, 22, -9],
    ambientSky: 0xa8c6e2, ambientGround: 0x6b7d8c, ambientIntensity: 1.0,
    fillColor: 0xbcd6ea, fillIntensity: 0.3,
    keyLightColor: 0xeaf4ff, keyLightIntensity: 0.04, keyLightDistance: 1.6,
    exposure: 0.98, fov: 55, far: 200, cameraPitch: -0.15,
    environmentIntensity: 0.95,
  },
  postfx: { bloomStrength: 0.22, bloomRadius: 0.7, bloomThreshold: 0.95 },
  hands: { skinColor: 0xb8836d, sleeveColor: 0x3d4653, curlLimit: 0.86 },

  create({ scene, handRig, audio }) {
    const terrain = createTerrain(scene, {
      color: 0xdae6ef, size: 220, amplitude: 3.4, offsetY: -1.55, frequency: 0.026,
      rocks: 26, rockColor: 0x8d97a3, rockScale: 0.34, rockSink: 0.05, grass: 0,
      grassHeight: 0.42, roughness: 0.88, seed: 13,
    });
    createTrees(scene, {
      count: 34, color: 0x39322a, innerRadius: 17, outerRadius: 60,
      minHeight: 5.5, maxHeight: 12, trunkRadius: 0.030, branches: 11,
      seed: 9, height: terrain.height,
    });

    const snowfall = createMotes(scene, {
      count: 520, box: 34, color: [1, 1, 1], size: 3.1,
      rise: -0.55, opacity: 0.8, sway: 0.5, blending: THREE.NormalBlending,
    });

    /** A six-armed crystal: a hub plus arms with side-branches. */
    function buildFlake() {
      const g = new THREE.Group();
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xcfe6f7, roughness: 0.06, metalness: 0,
        transmission: 0.88, thickness: 0.004, ior: 1.31,
        clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: new THREE.Color(0x9fd0f2), emissiveIntensity: 0.55,
      });
      const arm = new THREE.BoxGeometry(0.0032, 0.0216, 0.0016);
      const branch = new THREE.BoxGeometry(0.0023, 0.0088, 0.0013);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spine = new THREE.Mesh(arm, mat);
        spine.position.set(Math.sin(a) * 0.0108, 0, Math.cos(a) * 0.0108);
        spine.rotation.set(Math.PI / 2, 0, -a);
        spine.rotation.order = 'ZXY';
        spine.position.y = 0;
        g.add(spine);
        for (const [dist, tilt] of [[0.0064, 0.6], [0.0131, 0.55], [0.0186, 0.45]]) {
          for (const s of [-1, 1]) {
            const b = new THREE.Mesh(branch, mat);
            b.position.set(Math.sin(a) * dist, 0, Math.cos(a) * dist);
            b.rotation.set(Math.PI / 2, 0, -a + s * tilt);
            b.rotation.order = 'ZXY';
            g.add(b);
          }
        }
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.0018, 6), mat);
      g.add(hub);

      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.0072, 16, 14),
        new THREE.MeshPhysicalMaterial({
          color: 0xdff0fb, roughness: 0.02, metalness: 0,
          transmission: 0.95, thickness: 0.006, ior: 1.33,
          clearcoat: 1, transparent: true, opacity: 0,
        })
      );
      drop.scale.set(1, 0.82, 1);
      drop.visible = false;
      g.add(drop);

      g.userData = { crystal: g.children.filter((c) => c !== drop), drop, mat };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildFlake, dropHeight: 0.30, drift: 0.04 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'cue') audio.tone(1180, 0.2, 0.022, 'sine');
        else if (p === 'flex') prop.grasp();
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') prop.dispose();
      },

      update(dt, t, s) {
        snowfall.update(t);
        const o = prop.obj;
        if (!o) return;
        const { crystal, drop } = o.userData;

        if (phase === 'rest') {
          // Flakes don't fall straight — they tumble and drift.
          prop.descend(s.progress, 0.020, t);
          o.rotation.y = t * 0.9;
          o.rotation.x = Math.sin(t * 1.6) * 0.5 * (1 - s.progress);
          o.rotation.z = Math.cos(t * 1.3) * 0.35 * (1 - s.progress);
        } else if (phase === 'cue') {
          o.rotation.y += dt * 0.25;
        } else if (phase === 'flex') {
          o.rotation.x += (0 - o.rotation.x) * Math.min(1, dt * 5);
          o.rotation.z += (0 - o.rotation.z) * Math.min(1, dt * 5);
          o.rotation.y += dt * 0.1;
        } else if (phase === 'hold') {
          // Melting: arms retreat, the drop swells, the crystal fades out.
          const m = easeOut(s.progress);
          const scale = 1 - m * 0.82;
          for (const c of crystal) { c.scale.setScalar(Math.max(0.001, scale)); }
          o.userData.mat.opacity = 1 - m;
          o.userData.mat.transparent = true;
          drop.visible = m > 0.12;
          drop.material.opacity = Math.min(0.92, Math.max(0, (m - 0.12) * 1.5));
          drop.scale.set(0.5 + m * 0.7, (0.5 + m * 0.7) * 0.82, 0.5 + m * 0.7);
          o.rotation.y += dt * 0.12;
        } else if (phase === 'extend') {
          // The crystal is gone; only the drop is left to let go of.
          prop.fall(s.progress, { drop: 0.42, time: t });
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
