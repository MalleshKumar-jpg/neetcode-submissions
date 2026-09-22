import * as THREE from 'three';
import { TrialProp } from './common.js';
import { Accumulator } from '../workshop.js';
import { createTerrain, easeOut, easeInOut } from '../world.js';

/**
 * Balloon Tether — automatic.
 *
 * The original was an interactive round: hold your fist closed to keep the
 * balloon inside a band, scored, driven by buttons and the keyboard. None of
 * that survives the open-loop paradigm, so this is a rebuild rather than a
 * patch: nothing reads input, nothing is scored, and the hand closes on the
 * timeline whether or not the patient imagined anything.
 *
 * The toggle handle is the affordance (doc 2.3) — a thick wooden grip on a
 * taut line asks to be gripped — and the line going taut as the fist closes is
 * the movement itself rather than a switch for something else (2.2).
 */
export default {
  hud: {
    title: 'Balloon Tether',
    tagline: 'A balloon drifts down until its handle rests in your open hand. When the cue comes, imagine closing that hand — the fingers will close on the handle and the line will pull taut. Then they open and it rises away.',
    loadingLabel: 'Morning',
    loadingSub: 'Filling the balloons…',
  },
  scene: {
    fogColor: 0xc3d2de, fogDensity: 0.006,
    skyTop: 0x5f95c4, skyMid: 0xa8c6dc, skyBottom: 0xe2dcc4,
    sunColor: 0xfff2d8, sunIntensity: 2.6, sunPosition: [0, 18, -14],
    ambientSky: 0xbcd4e6, ambientGround: 0x76805c, ambientIntensity: 1.5,
    fillColor: 0xfff0d4, fillIntensity: 0.5,
    keyLightColor: 0xfff4e6, keyLightIntensity: 0.03, keyLightDistance: 1.8,
    exposure: 0.98, fov: 55, far: 220, cameraPitch: -0.10,
    environmentIntensity: 1.0,
    shadows: true,
  },
  postfx: { bloomStrength: 0.20, bloomRadius: 0.65, bloomThreshold: 0.93 },
  hands: { skinColor: 0xb07a5e, sleeveColor: 0x4d5a4a, curlLimit: 0.90 },

  create({ scene, handRig }) {
    // A plain field and a large sky. Nothing else at ground level — the doc's
    // clutter rule matters more here than scenery, and the balloons need room.
    createTerrain(scene, {
      color: 0x6f7d4c, size: 240, amplitude: 0.9, offsetY: -1.5, frequency: 0.02,
      rocks: 0, grass: 0, roughness: 0.95, segments: 80, seed: 5,
    });

    const BALLOON = 0xc9534a;
    const balloonMat = new THREE.MeshPhysicalMaterial({
      color: BALLOON, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.28,
      sheen: 0.3, sheenColor: new THREE.Color(0xffc9b4), envMapIntensity: 0.9,
    });

    function balloonGeometry(r = 0.092) {
      const g = new THREE.SphereGeometry(r, 26, 20);
      g.scale(1, 1.20, 1);
      const pos = g.attributes.position;
      // Pinch toward the knot so it reads as a balloon rather than an egg.
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.max(0, -y / (r * 1.2));
        const k = 1 - Math.pow(t, 2.6) * 0.42;
        pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
      }
      g.computeVertexNormals();
      return g;
    }

    // Released balloons gather high and dead ahead, so the session's progress
    // is visible without anything drawing the eye off the midline.
    const cluster = new Accumulator(scene, {
      geometry: balloonGeometry(0.30),
      material: balloonMat,
      capacity: 60,
      place: (d, i) => {
        const a = i * 2.399;
        const r = 0.9 * Math.sqrt(i / 60);
        d.position.set(Math.cos(a) * r, 5.2 + (i % 5) * 0.16, -11 + Math.sin(a) * r);
        d.rotation.set(0, a, Math.sin(i) * 0.08);
        d.scale.setScalar(0.9 + ((i * 31) % 20) / 100);
      },
    });

    const TETHER_LEN = 0.78;

    function buildTether() {
      const g = new THREE.Group();

      // Toggle handle: what the hand actually closes on.
      const handle = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.044, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.72 })
      );
      handle.rotation.z = Math.PI / 2;
      handle.castShadow = true;
      g.add(handle);

      const line = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0016, 0.0016, 1, 5),
        new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.8 })
      );
      line.geometry.translate(0, 0.5, 0);   // grows upward from the handle
      g.add(line);

      const balloon = new THREE.Mesh(balloonGeometry(), balloonMat);
      balloon.position.y = TETHER_LEN;
      balloon.castShadow = true;
      g.add(balloon);

      const knot = new THREE.Mesh(
        new THREE.ConeGeometry(0.012, 0.022, 8),
        new THREE.MeshStandardMaterial({ color: 0xa8443c, roughness: 0.5 })
      );
      knot.position.y = TETHER_LEN - 0.112;
      knot.rotation.x = Math.PI;
      g.add(knot);

      g.userData = { handle, line, balloon, knot, slack: 0 };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildTether, dropHeight: 0.30, drift: 0.05 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'flex') prop.grasp(true);
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') {
          if (prop.obj && !prop.obj.userData.released) {
            prop.obj.userData.released = true;
            cluster.add();
          }
          prop.dispose();
        }
      },

      update(dt, t, s) {
        const o = prop.obj;
        if (!o) return;
        const u = o.userData;

        // The line goes taut as the fist closes: slack while the hand is open,
        // straight and lifting once it has hold.
        const taut = s.curl;
        const len = TETHER_LEN + taut * 0.09;
        u.balloon.position.y = len;
        u.knot.position.y = len - 0.112;
        u.line.scale.y = len;
        // A little sway, damped out as the line tightens.
        const sway = (1 - taut) * 0.035 + 0.006;
        u.balloon.position.x = Math.sin(t * 1.3) * sway;
        u.balloon.position.z = Math.cos(t * 1.1) * sway * 0.7;
        u.line.rotation.z = -u.balloon.position.x / len * 0.8;
        u.line.rotation.x = u.balloon.position.z / len * 0.8;

        if (phase === 'rest') {
          prop.descend(s.progress, 0.012, t);
          o.rotation.y = (1 - easeInOut(s.progress)) * 0.4;
        } else if (phase === 'extend') {
          // Let go: it climbs away rather than being set down.
          const e = easeOut(s.progress);
          prop.depart(s.progress, { rise: 0.9, sway: 0.10, time: t });
          o.position.y += e * 0.35 * dt * 12;
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
