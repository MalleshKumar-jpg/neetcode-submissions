import * as THREE from 'three';
import { TrialProp } from './common.js';
import { createWorkbench, applySqueeze, lumpGeometry, Accumulator } from '../workshop.js';
import { easeOut } from '../world.js';

/**
 * Potter's Hand — a ball of clay is set in the palm, the fist closes on it,
 * and it keeps the impression.
 *
 * Built to design-doc 2.3: clay is the clearest squeeze affordance there is,
 * so the object itself says what movement is wanted with no instruction. The
 * deformation during flex satisfies 2.2 — the on-screen action is the movement
 * being made, not a switch for something unrelated.
 *
 * Progression is native to the material: each finished piece is set on the
 * board ahead, so the row grows across the session without adding clutter.
 */
export default {
  hud: {
    title: "Potter's Hand",
    tagline: 'A ball of clay is set in your open hand. When the cue comes, imagine closing that hand — the fingers will close and the clay will take the shape of your grip. Each piece is set on the board in front of you.',
    loadingLabel: 'Workshop',
    loadingSub: 'Wedging the clay…',
  },
  scene: {
    fogColor: 0xbcae99, fogDensity: 0.004,
    skyTop: 0x9fb2c4, skyMid: 0xc9bda8, skyBottom: 0xd8cbb4,
    sunColor: 0xfff2dc, sunIntensity: 2.4, sunPosition: [0, 6, 2.5],
    ambientSky: 0xd4dce4, ambientGround: 0x8a7a63, ambientIntensity: 1.5,
    fillColor: 0xfff0d8, fillIntensity: 0.6,
    keyLightColor: 0xfff4e4, keyLightIntensity: 0.03, keyLightDistance: 1.8,
    exposure: 0.98, fov: 55, far: 40, cameraPitch: -0.30,
    environmentIntensity: 1.0,
    shadows: true,
  },
  postfx: { bloomStrength: 0.14, bloomRadius: 0.6, bloomThreshold: 0.96 },
  hands: { skinColor: 0xb07a5e, sleeveColor: 0x6d6353, curlLimit: 0.94 },

  create({ scene, handRig }) {
    const bench = createWorkbench(scene, {
      surfaceColor: 0x654a33, backdropColor: 0xcfc9bd, floorColor: 0x7d7568, y: -0.34, depth: -1.05,
    });

    const CLAY = 0xb0684a;
    const clayMat = () => new THREE.MeshStandardMaterial({
      color: CLAY, roughness: 0.94, metalness: 0.0,
    });

    // The board the finished pieces go onto — dead centre, so the eye never
    // has to travel sideways to find it.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.018, 0.30),
      new THREE.MeshStandardMaterial({ color: 0x3f3226, roughness: 0.84 })
    );
    board.position.set(0, bench.surfaceY + 0.009, -0.86);
    board.receiveShadow = true;
    scene.add(board);

    // A finished piece: already squeezed, so the row reads as work done.
    // Flattened, because that is what a squeezed piece looks like — an
    // upright egg would contradict the movement that produced it.
    const finishedGeo = lumpGeometry(0.026, 2, 0.14);
    finishedGeo.scale(1.18, 0.52, 1.06);
    const finished = new Accumulator(scene, {
      geometry: finishedGeo,
      material: clayMat(),
      capacity: 48,
      place: (d, i) => {
        const col = i % 8, row = Math.floor(i / 8);
        d.position.set(
          -0.182 + col * 0.052,
          bench.surfaceY + 0.026,   // resting on the board, not sunk into it
          -0.96 + row * 0.050
        );
        d.rotation.set(0, (i * 1.7) % Math.PI, 0);
        d.scale.setScalar(0.92 + ((i * 37) % 17) / 100);
      },
    });

    let squeezeUniforms = null;

    function buildClay() {
      const g = new THREE.Group();
      const mat = clayMat();
      squeezeUniforms = applySqueeze(mat, { squash: 0.55, bulge: 0.26, grooves: 0.0026, bands: 85, axis: 'z' });
      const ball = new THREE.Mesh(lumpGeometry(0.032, 3, 0.10), mat);
      ball.castShadow = true;
      g.add(ball);
      g.userData = { mat, ball };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildClay, dropHeight: 0.18, drift: 0.03 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'flex') prop.grasp(true);
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') {
          // On the transition, not a progress threshold — a slow frame can
          // step straight over a threshold and the piece is never recorded.
          if (prop.obj && !prop.obj.userData.landed) {
            prop.obj.userData.landed = true;
            finished.add();
          }
          prop.dispose();
          squeezeUniforms = null;
        }
      },

      update(dt, t, s) {
        // The clay reads the grip directly: this is the movement, rendered.
        if (squeezeUniforms) squeezeUniforms.uSqueeze.value = s.curl;

        const o = prop.obj;
        if (!o) return;

        if (phase === 'rest') {
          prop.descend(s.progress, 0.004, t);
          o.rotation.y = s.progress * 1.2;
        } else if (phase === 'extend') {
          // Set down on the board rather than lifted away — the piece stays.
          const e = easeOut(s.progress);
          prop.depart(0, {});
          o.position.lerp(new THREE.Vector3(0, bench.surfaceY + 0.05, -0.80), e * 0.28);
          o.position.y -= e * 0.03;
          prop.setOpacity(1 - easeOut(Math.max(0, (s.progress - 0.75) / 0.25)));
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
