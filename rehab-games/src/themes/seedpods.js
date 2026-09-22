import * as THREE from 'three';
import { TrialProp } from './common.js';
import { createWorkbench, applySqueeze, Accumulator } from '../workshop.js';
import { easeOut } from '../world.js';

/**
 * Seed Pods — a ripe pod is set in the palm; the closing fist splits it and
 * the seeds fall into the bowl below.
 *
 * The pod is the affordance (doc 2.3): a swollen, ribbed husk reads as
 * something that wants crushing. The split happens at the grip threshold, so
 * the visible event is caused by the movement itself rather than triggered
 * alongside it (2.2).
 */
export default {
  hud: {
    title: 'Seed Pods',
    tagline: 'A ripe pod is set in your open hand. When the cue comes, imagine closing that hand — the fingers will close, the pod will split, and the seeds will fall into the bowl in front of you.',
    loadingLabel: 'Late summer',
    loadingSub: 'Bringing in the pods…',
  },
  scene: {
    fogColor: 0xc3cbb6, fogDensity: 0.005,
    skyTop: 0x88a6c0, skyMid: 0xc0cbb4, skyBottom: 0xdcd9bd,
    sunColor: 0xfff4d8, sunIntensity: 2.6, sunPosition: [0, 7, 2],
    ambientSky: 0xcfdce0, ambientGround: 0x8d8a63, ambientIntensity: 1.5,
    fillColor: 0xfaf0d2, fillIntensity: 0.55,
    keyLightColor: 0xfff6e6, keyLightIntensity: 0.03, keyLightDistance: 1.8,
    exposure: 0.97, fov: 55, far: 40, cameraPitch: -0.30,
    environmentIntensity: 1.05,
    shadows: true,
  },
  postfx: { bloomStrength: 0.16, bloomRadius: 0.6, bloomThreshold: 0.95 },
  hands: { skinColor: 0xb07a5e, sleeveColor: 0x5c6552, curlLimit: 0.92 },

  create({ scene, handRig }) {
    const bench = createWorkbench(scene, {
      surfaceColor: 0x5e5238, backdropColor: 0xdcdcc6, floorColor: 0x8a8874, y: -0.34, depth: -1.05,
    });

    const HUSK = 0xbba64f;
    const SEED = 0x4a3524;

    // The bowl the seeds fall into — on the midline, low, static.
    // An explicit profile: inner wall up from the base, over the rim, and back
    // down the outside. A sphere section reads as a dome from a low angle.
    const bowlProfile = [];
    for (let i = 0; i <= 10; i++) {                    // inside, base to rim
      const t = i / 10;
      bowlProfile.push(new THREE.Vector2(Math.sin(t * 1.25) * 0.082 + 0.002, t * t * 0.036));
    }
    bowlProfile.push(new THREE.Vector2(0.086, 0.039)); // rim
    for (let i = 10; i >= 0; i--) {                    // outside, rim to base
      const t = i / 10;
      bowlProfile.push(new THREE.Vector2(Math.sin(t * 1.25) * 0.086 + 0.006, t * t * 0.034 - 0.004));
    }
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(bowlProfile, 30),
      new THREE.MeshStandardMaterial({ color: 0x5c5040, roughness: 0.8, side: THREE.DoubleSide })
    );
    bowl.position.set(0, bench.surfaceY + 0.006, -0.84);
    bowl.receiveShadow = true;
    scene.add(bowl);

    const seedGeo = new THREE.SphereGeometry(0.0072, 8, 6);
    seedGeo.scale(1, 0.72, 1.25);
    const collected = new Accumulator(scene, {
      geometry: seedGeo,
      material: new THREE.MeshStandardMaterial({ color: SEED, roughness: 0.66 }),
      capacity: 260,
      place: (d, i) => {
        // Spiral fill so the heap grows outward and upward naturally.
        const a = i * 2.399;
        const r = 0.062 * Math.sqrt(i / 260);
        d.position.set(
          Math.cos(a) * r,
          bench.surfaceY + 0.030 + (i / 260) * 0.040,
          -0.84 + Math.sin(a) * r
        );
        d.rotation.set(i * 0.7, i * 1.3, i * 0.4);
        d.scale.setScalar(0.85 + ((i * 29) % 30) / 100);
      },
    });

    // A few spare pods, well back and still.
    function podGeometry(len = 0.052, rad = 0.017) {
      const g = new THREE.CapsuleGeometry(rad, len, 6, 14);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // Ribs along the pod, and a swollen middle: it reads as ripe.
        const swell = 1 + Math.cos((v.y / (len * 0.5 + rad)) * 1.35) * 0.20;
        const rib = 1 + Math.sin(Math.atan2(v.z, v.x) * 5) * 0.045;
        v.x *= swell * rib; v.z *= swell * rib;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    }
    const SPLIT_AT = 0.52;   // grip fraction where the husk gives way
    let squeezeUniforms = null;

    function buildPod() {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: HUSK, roughness: 0.88 });
      squeezeUniforms = applySqueeze(mat, { squash: 0.40, bulge: 0.18, grooves: 0.0018, bands: 65, axis: 'z' });

      const intact = new THREE.Mesh(podGeometry(), mat);
      intact.rotation.z = Math.PI / 2;
      intact.castShadow = true;
      g.add(intact);

      // Two halves, revealed once it splits.
      const halves = new THREE.Group();
      halves.visible = false;
      const halfMat = new THREE.MeshStandardMaterial({ color: HUSK, roughness: 0.9, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(
          new THREE.SphereGeometry(0.019, 16, 10, 0, Math.PI, 0, Math.PI),
          halfMat
        );
        h.scale.set(1, 2.3, 1);
        h.rotation.z = Math.PI / 2;
        h.rotation.y = s > 0 ? 0 : Math.PI;
        h.userData = { side: s };
        halves.add(h);
      }
      g.add(halves);

      // Loose seeds inside, which fall when it opens.
      const seeds = new THREE.Group();
      const sMat = new THREE.MeshStandardMaterial({ color: SEED, roughness: 0.66 });
      for (let i = 0; i < 7; i++) {
        const sd = new THREE.Mesh(seedGeo, sMat);
        sd.position.set((i - 3) * 0.0115, 0, 0);
        sd.userData = { vel: new THREE.Vector3(), seated: false };
        seeds.add(sd);
      }
      g.add(seeds);

      g.userData = { mat, intact, halves, seeds, split: false, counted: false };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildPod, dropHeight: 0.19, drift: 0.035 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'flex') prop.grasp(true);
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') {
          // On the transition, not a progress threshold — sparse frames skip it.
          if (prop.obj && !prop.obj.userData.counted) {
            prop.obj.userData.counted = true;
            for (let i = 0; i < 7; i++) collected.add();
          }
          prop.dispose();
          squeezeUniforms = null;
        }
      },

      update(dt, t, s) {
        const o = prop.obj;
        if (!o) return;
        const u = o.userData;

        if (!u.split && squeezeUniforms) squeezeUniforms.uSqueeze.value = s.curl;

        // The husk gives way once the grip passes the threshold — the split is
        // caused by the closing hand, not scheduled alongside it.
        if (!u.split && s.curl >= SPLIT_AT && (phase === 'flex' || phase === 'hold')) {
          u.split = true;
          u.intact.visible = false;
          u.halves.visible = true;
          for (const sd of u.seeds.children) {
            sd.userData.vel.set((Math.random() - 0.5) * 0.09, 0.02, -0.34 - Math.random() * 0.12);
          }
        }

        if (u.split) {
          const open = Math.min(1, (s.curl - SPLIT_AT) / (1 - SPLIT_AT) + (phase === 'hold' ? 0.3 : 0));
          for (const h of u.halves.children) {
            h.position.z = h.userData.side * open * 0.016;
            h.rotation.x = h.userData.side * open * 0.5;
          }
          for (const sd of u.seeds.children) {
            if (sd.userData.seated) continue;
            sd.userData.vel.y -= 1.1 * dt;
            sd.position.addScaledVector(sd.userData.vel, dt);
            sd.rotation.x += dt * 4;
          }
        }

        if (phase === 'rest') {
          prop.descend(s.progress, 0.005, t);
          o.rotation.z = s.progress * 0.5;
        } else if (phase === 'extend') {
          const e = easeOut(s.progress);
          prop.depart(0, {});
          o.position.y -= e * 0.02;
          prop.setOpacity(1 - e);
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
