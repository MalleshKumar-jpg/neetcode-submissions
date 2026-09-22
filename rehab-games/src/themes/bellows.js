import * as THREE from 'three';
import { TrialProp } from './common.js';
import { createWorkbench, Accumulator } from '../workshop.js';
import { easeOut, easeInOut } from '../world.js';

/**
 * Bellows — a small leather bellows sits in the palm; squeezing it puffs air
 * across the bench and turns a paper pinwheel.
 *
 * The bellows is a pure squeeze affordance (doc 2.3) and the compression is
 * the movement itself (2.2). The pinwheel gives a second, distant confirmation
 * without putting anything near the hands: it sits dead centre and well back,
 * so it never pulls the gaze off the midline.
 *
 * Deliberately silent. A puff sound would be an auditory onset inside the
 * epoch; if you want one, put it in the inter-trial rest.
 */
export default {
  hud: {
    title: 'Bellows',
    tagline: 'A small bellows rests in your open hand. When the cue comes, imagine closing that hand — the fingers will close, the bellows will compress, and the puff of air will turn the pinwheel ahead of you.',
    loadingLabel: 'Workshop',
    loadingSub: 'Oiling the leather…',
  },
  scene: {
    fogColor: 0xc0b5a6, fogDensity: 0.005,
    skyTop: 0x93a8bb, skyMid: 0xc5bca9, skyBottom: 0xd6c9b2,
    sunColor: 0xfff0d4, sunIntensity: 2.3, sunPosition: [0, 6.5, 2.2],
    ambientSky: 0xd2dae2, ambientGround: 0x8b7f6a, ambientIntensity: 1.55,
    fillColor: 0xfff2dc, fillIntensity: 0.6,
    keyLightColor: 0xfff4e4, keyLightIntensity: 0.03, keyLightDistance: 1.8,
    exposure: 0.98, fov: 55, far: 40, cameraPitch: -0.26,
    environmentIntensity: 1.0,
    shadows: true,
  },
  postfx: { bloomStrength: 0.15, bloomRadius: 0.6, bloomThreshold: 0.95 },
  hands: { skinColor: 0xb07a5e, sleeveColor: 0x63594a, curlLimit: 0.88 },

  create({ scene, handRig }) {
    const bench = createWorkbench(scene, {
      surfaceColor: 0x584734, backdropColor: 0xd6cfc0, floorColor: 0x7f7669, y: -0.34, depth: -1.05,
    });

    // --- Pinwheel: dead centre, well back, the only moving thing in the scene ---
    const pinwheel = new THREE.Group();
    pinwheel.position.set(0, bench.surfaceY + 0.20, -0.98);
    scene.add(pinwheel);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.013, 0.20, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.85 })
    );
    post.position.y = -0.10;
    post.castShadow = true;
    pinwheel.add(post);

    const vanes = new THREE.Group();
    const vaneMats = [0xe2d3b4, 0xd8c39c].map((c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.76, side: THREE.DoubleSide,
    }));
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.036), vaneMats[i % 2]);
      const a = (i / 6) * Math.PI * 2;
      v.position.set(Math.cos(a) * 0.042, Math.sin(a) * 0.042, 0);
      v.rotation.z = a;
      v.rotation.y = 0.62;          // pitch, so it reads as catching air
      v.castShadow = true;
      vanes.add(v);
    }
    pinwheel.add(vanes);
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.55, metalness: 0.35 })
    );
    pinwheel.add(hub);

    let spin = 0;          // current angular velocity
    let vaneAngle = 0;

    // A tally of turns completed, as small pegs on the bench — progression
    // without anything near the hands.
    const pegs = new Accumulator(scene, {
      geometry: new THREE.CylinderGeometry(0.0055, 0.0055, 0.030, 7),
      material: new THREE.MeshStandardMaterial({ color: 0x7d6a4c, roughness: 0.8 }),
      capacity: 60,
      place: (d, i) => {
        const col = i % 12, row = Math.floor(i / 12);
        d.position.set(-0.132 + col * 0.024, bench.surfaceY + 0.015, -0.80 + row * 0.028);
        d.rotation.set(0, 0, 0);
      },
    });

    // --- The bellows itself ---
    const LEATHER = 0x6b4a34;
    const WOOD = 0x8a6b45;

    function buildBellows() {
      const g = new THREE.Group();

      const woodMat = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.74 });
      const leatherMat = new THREE.MeshStandardMaterial({
        color: LEATHER, roughness: 0.92, side: THREE.DoubleSide,
      });

      // Two paddle-shaped boards, tapering to the hinge at the back.
      const boardShape = () => {
        const g2 = new THREE.CylinderGeometry(0.030, 0.014, 0.009, 14);
        g2.scale(1, 1, 1.5);
        return g2;
      };

      const lower = new THREE.Mesh(boardShape(), woodMat);
      lower.position.set(0, -0.019, 0.004);
      lower.castShadow = true;
      g.add(lower);

      const upperPivot = new THREE.Group();
      upperPivot.position.set(0, -0.019, -0.040);
      g.add(upperPivot);
      const upper = new THREE.Mesh(boardShape(), woodMat);
      upper.position.set(0, 0.038, 0.044);
      upper.castShadow = true;
      upperPivot.add(upper);

      // Accordion gusset: stacked rings, so it reads as pleated leather.
      const gusset = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(0.029 - t * 0.003, 0.029 - t * 0.003, 0.008, 14, 1, true),
          leatherMat
        );
        ring.scale.z = 1.45;
        ring.position.y = -0.014 + i * 0.012;
        gusset.add(ring);
      }
      g.add(gusset);

      // Nozzle, aimed forward at the pinwheel.
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.009, 0.050, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a8560, roughness: 0.45, metalness: 0.45 })
      );
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, -0.006, 0.062);
      nozzle.castShadow = true;
      g.add(nozzle);

      const puff = new THREE.Mesh(
        new THREE.ConeGeometry(0.032, 0.15, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xf4efe4, transparent: true, opacity: 0,
          depthWrite: false, side: THREE.DoubleSide,
        })
      );
      puff.rotation.x = -Math.PI / 2;
      puff.position.set(0, -0.006, 0.155);
      g.add(puff);

      g.rotation.x = -0.22;
      g.userData = { upperPivot, gusset, puff, fired: false };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildBellows, dropHeight: 0.17, drift: 0.03 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'flex') prop.grasp(true);
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') {
          // On the transition, not a progress threshold — sparse frames skip it.
          if (prop.obj && !prop.obj.userData.tallied) {
            prop.obj.userData.tallied = true;
            pegs.add();
          }
          prop.dispose();
        }
      },

      update(dt, t, s) {
        // Pinwheel coasts down; the puff is what drives it.
        spin = Math.max(0, spin - dt * 2.2);
        vaneAngle += spin * dt;
        vanes.rotation.z = vaneAngle;

        const o = prop.obj;
        if (!o) return;
        const u = o.userData;

        // Compression is the grip, one to one.
        const c = s.curl;
        u.upperPivot.rotation.x = c * 0.46;
        u.gusset.scale.y = 1 - c * 0.62;
        u.gusset.position.y = -c * 0.006;

        if (phase === 'flex' && c > 0.3 && !u.fired) {
          u.fired = true;
          spin = 9.5;
        }
        // The puff tracks the compression rate rather than a timer, so the air
        // is visibly caused by the hand closing.
        const target = phase === 'flex' ? Math.max(0, Math.sin(s.progress * Math.PI)) * 0.42 : 0;
        u.puff.material.opacity += (target - u.puff.material.opacity) * Math.min(1, dt * 9);
        u.puff.scale.setScalar(0.7 + u.puff.material.opacity * 1.6);

        if (phase === 'rest') {
          prop.descend(s.progress, 0.004, t);
          o.rotation.z = (1 - easeInOut(s.progress)) * 0.35;
        } else if (phase === 'extend') {
          const e = easeOut(s.progress);
          prop.depart(0, {});
          o.position.y -= e * 0.015;
          prop.setOpacity(1 - e);
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
