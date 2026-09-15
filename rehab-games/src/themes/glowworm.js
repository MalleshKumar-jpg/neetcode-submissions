import * as THREE from 'three';
import { createTerrain, createMotes, createTrees, createScatter, fernGeometry, mushroomGeometry } from '../world.js';
import { TrialProp, markLight } from './common.js';

/**
 * Glowworm Hollow — a firefly settles onto the open palm, is cupped, and its
 * light bleeds out between the closed fingers before it lifts away.
 *
 * The hold phase is the point: a light source physically inside the fist, so
 * the fingers glow from within for the full 2.5 seconds.
 */
export default {
  hud: {
    title: 'Glowworm Glade',
    tagline: 'A firefly drifts down and settles on your open hand. When the cue comes, imagine closing that hand — the fingers will close around it and its light will spill between them. Then they open and it lifts away.',
    loadingLabel: 'Evening',
    loadingSub: 'Waking the glade…',
  },
  scene: {
    fogColor: 0xa9bfba, fogDensity: 0.030,
    skyTop: 0x5f97b8, skyMid: 0x9dc0bd, skyBottom: 0xe0cfa4,
    sunColor: 0xffe2ae, sunIntensity: 3.0, sunPosition: [-3, 13, -15],
    ambientSky: 0x9dc0c8, ambientGround: 0x4e6b46, ambientIntensity: 1.25,
    fillColor: 0xc4dcb4, fillIntensity: 0.45,
    keyLightColor: 0xdff0d8, keyLightIntensity: 0.02, keyLightDistance: 1.9,
    exposure: 0.95, fov: 55, far: 150, cameraPitch: -0.13,
    environmentIntensity: 0.95,
  },
  postfx: { bloomStrength: 0.30, bloomRadius: 0.6, bloomThreshold: 0.88 },
  hands: { skinColor: 0xb07a5e, sleeveColor: 0x3b4a42 },

  create({ scene, handRig, audio }) {
    const terrain = createTerrain(scene, {
      color: 0x3e5c33, size: 160, amplitude: 1.5, offsetY: -1.35, frequency: 0.05,
      rocks: 26, rockColor: 0x5f665c, rockScale: 0.45, rockSink: 0.1,
      grass: 650, grassColor: 0x4e7539, grassHeight: 0.34, seed: 21,
    });
    createTrees(scene, {
      count: 34, color: 0x46392c, innerRadius: 7, outerRadius: 34,
      minHeight: 6, maxHeight: 13, trunkRadius: 0.040, branches: 9,
      canopyColor: 0x365c2e, canopyCount: 84, canopyRadius: 1.6,
      seed: 5, height: terrain.height,
    });

    // Undergrowth. An empty lawn reads as a placeholder; ferns, toadstools and
    // a few flowers give the glade somewhere to be.
    createScatter(scene, {
      geometry: fernGeometry(9, 0.6),
      material: new THREE.MeshStandardMaterial({ color: 0x35602e, roughness: 0.88, side: THREE.DoubleSide }),
      count: 85, innerRadius: 1.1, outerRadius: 18, height: terrain.height,
      minScale: 0.7, maxScale: 1.6, seed: 44, tilt: 0.3, avoidCentre: 0.9,
    });
    createScatter(scene, {
      geometry: mushroomGeometry(0.055, 0.075),
      material: new THREE.MeshStandardMaterial({ color: 0xd9c9a6, roughness: 0.8 }),
      count: 44, innerRadius: 1.0, outerRadius: 12, height: terrain.height,
      minScale: 0.6, maxScale: 1.5, seed: 61, tilt: 0.12, avoidCentre: 0.8,
    });
    createScatter(scene, {
      geometry: new THREE.SphereGeometry(0.035, 8, 6),
      material: new THREE.MeshStandardMaterial({
        color: 0xf2eec4, roughness: 0.7,
        emissive: new THREE.Color(0xdad38a), emissiveIntensity: 0.25,
      }),
      count: 100, innerRadius: 1.0, outerRadius: 15, height: terrain.height,
      minScale: 0.5, maxScale: 1.3, seed: 77, sink: -0.12, avoidCentre: 0.8,
    });

    // The ambient swarm the trial firefly comes from and returns to.
    const swarm = createMotes(scene, {
      count: 150, box: 30, color: [0.86, 1.0, 0.56], size: 4.0,
      rise: 0.12, opacity: 0.8, sway: 1.5,
    });
    const haze = createMotes(scene, {
      count: 80, box: 22, color: [0.85, 0.94, 0.88], size: 2.4,
      rise: 0.05, opacity: 0.2, sway: 0.7, blending: THREE.NormalBlending,
    });

    const BODY = 0x1d1a14;
    const GLOW = 0xcaff72;

    function buildFirefly() {
      const g = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0062, 0.013, 4, 10),
        new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.62, metalness: 0.1 })
      );
      body.rotation.x = Math.PI / 2;
      g.add(body);

      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.0082, 14, 12),
        new THREE.MeshStandardMaterial({
          color: 0x2a3315, emissive: new THREE.Color(GLOW),
          emissiveIntensity: 3.4, roughness: 0.4,
        })
      );
      lantern.position.z = 0.0125;
      lantern.scale.set(1, 0.92, 1.25);
      g.add(lantern);

      const wingMat = new THREE.MeshPhysicalMaterial({
        color: 0xdff0d4, transparent: true, opacity: 0.22, roughness: 0.25,
        transmission: 0.7, side: THREE.DoubleSide, depthWrite: false,
      });
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.CircleGeometry(0.0125, 12), wingMat);
        wing.scale.set(1, 0.42, 1);
        wing.position.set(s * 0.0055, 0.0032, -0.001);
        wing.rotation.set(-1.15, s * 0.5, s * 0.25);
        g.add(wing);
      }

      const light = markLight(new THREE.PointLight(GLOW, 0.028, 0.6, 2));
      g.add(light);

      g.userData = { lantern, light, wings: g.children.filter((c) => c.geometry?.type === 'CircleGeometry') };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildFirefly, dropHeight: 0.26, drift: 0.055 });
    let phase = 'rest';
    let progress = 0;

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') {
          prop.spawn(ctx.side);
        } else if (p === 'cue') {
          audio.tone(880, 0.18, 0.03, 'sine');
        } else if (p === 'flex') {
          prop.grasp();
        } else if (p === 'hold') {
          audio.tone(1320, 0.3, 0.018, 'sine');
        } else if (p === 'extend') {
          prop.beginDepart();
        } else if (p === 'iti') {
          prop.dispose();
        }
      },

      update(dt, t, s) {
        progress = s.progress;
        swarm.update(t);
        haze.update(t);

        const o = prop.obj;
        if (!o) return;
        const { lantern, light } = o.userData;

        // Wingbeat while airborne, stilled once it settles.
        const airborne = phase === 'rest' || phase === 'extend';
        for (const w of o.userData.wings) {
          w.rotation.z = (w.position.x > 0 ? 1 : -1) * (airborne ? 0.25 + Math.sin(t * 46) * 0.5 : 0.22);
        }

        if (phase === 'rest') {
          prop.descend(progress, 0.014, t);
          o.rotation.y = Math.sin(t * 2.4) * 0.5;
          const warm = 0.35 + progress * 0.65;
          lantern.material.emissiveIntensity = 3.4 * warm;
          light.intensity = 0.028 * warm;
        } else if (phase === 'cue') {
          // Landed and settling: a brief flare so the cue still reads as an event.
          const settle = 1 + (1 - progress) * 0.5;
          lantern.material.emissiveIntensity = 3.7 * settle;
          light.intensity = 0.034 * settle;
        } else if (phase === 'flex') {
          // Breathing slowly, waiting to be enclosed.
          const pulse = 0.85 + Math.sin(t * 3.0) * 0.15;
          lantern.material.emissiveIntensity = 3.7 * pulse;
          light.intensity = 0.032 * pulse;
        } else if (phase === 'hold') {
          // The signature beat: brighter inside the dark of the closed fist,
          // with a slow heartbeat so the 2.5s never reads as a frozen frame.
          const beat = 0.78 + Math.sin(progress * Math.PI * 3.4) * 0.22;
          const enclosed = 1.5;
          lantern.material.emissiveIntensity = 3.9 * beat * enclosed;
          light.intensity = 0.16 * beat;
          light.distance = 0.55;
        } else if (phase === 'extend') {
          prop.depart(progress, { rise: 0.62, sway: 0.075, time: t, spin: 0.9 });
          o.rotation.y += dt * 1.5;
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
