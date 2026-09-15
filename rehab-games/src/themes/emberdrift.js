import * as THREE from 'three';
import { createTerrain, createMotes, createTrees, createScatter, easeOut } from '../world.js';
import { TrialProp, markLight } from './common.js';

/**
 * Ember Drift — an ember lifts off the fire, settles in the palm, and burns
 * brighter inside the closed fist before floating away.
 *
 * The fire sits dead ahead rather than off to one side: a lateral light source
 * would put a standing luminance difference between the two hands, which is
 * exactly the kind of asymmetry a left/right classifier learns instead of
 * motor imagery.
 */
export default {
  hud: {
    title: 'Ember Drift',
    tagline: 'An ember lifts from the fire and comes to rest on your open hand. When the cue comes, imagine closing that hand — it will burn brighter inside your fist. Then your fingers open and it drifts up on its own heat.',
    loadingLabel: 'Evening',
    loadingSub: 'Building the fire…',
  },
  scene: {
    fogColor: 0xa89179, fogDensity: 0.016,
    skyTop: 0x6e8fb4, skyMid: 0xceab86, skyBottom: 0xf0c78e,
    sunColor: 0xffd296, sunIntensity: 3.2, sunPosition: [-2, 10, -26],
    ambientSky: 0xbfae9a, ambientGround: 0x5e4733, ambientIntensity: 1.35,
    fillColor: 0xffc890, fillIntensity: 0.45,
    keyLightColor: 0xffd8b4, keyLightIntensity: 0.02, keyLightDistance: 1.7,
    exposure: 0.94, fov: 55, far: 160, cameraPitch: -0.13,
    environmentIntensity: 0.95,
  },
  postfx: { bloomStrength: 0.38, bloomRadius: 0.6, bloomThreshold: 0.86 },
  hands: { skinColor: 0xb07c5c, sleeveColor: 0x4a3828, curlLimit: 0.82 },

  create({ scene, handRig, audio }) {
    const terrain = createTerrain(scene, {
      color: 0x6b553b, size: 150, amplitude: 1.1, offsetY: -1.3, frequency: 0.045,
      rocks: 34, rockColor: 0x8e8272, rockScale: 0.4, rockSink: 0.1,
      grass: 700, grassColor: 0x74703c, grassHeight: 0.3, seed: 17,
    });
    createTrees(scene, {
      count: 24, color: 0x5d4b38, innerRadius: 13, outerRadius: 44,
      minHeight: 6, maxHeight: 12, trunkRadius: 0.036, branches: 9,
      canopyColor: 0x4f5c33, canopyCount: 80, canopyRadius: 1.6,
      seed: 3, height: terrain.height,
    });
    createScatter(scene, {
      geometry: new THREE.IcosahedronGeometry(0.11, 0),
      material: new THREE.MeshStandardMaterial({ color: 0x7d6a55, roughness: 0.93, flatShading: true }),
      count: 90, innerRadius: 1.3, outerRadius: 20, height: terrain.height,
      minScale: 0.5, maxScale: 1.6, seed: 52, avoidCentre: 0.9,
    });

    // The fire: directly ahead, low, and symmetric about the midline.
    const fire = new THREE.Group();
    fire.position.set(0, terrain.height(0, -5.6) - 0.35, -5.6);
    scene.add(fire);

    const logMat = new THREE.MeshStandardMaterial({ color: 0x33261a, roughness: 0.92 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 1.25, 7), logMat);
      log.position.set(Math.cos(a) * 0.28, 0.16, Math.sin(a) * 0.28);
      log.rotation.set(Math.PI / 2 - 0.55, a, 0);
      log.castShadow = true;
      fire.add(log);
    }

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff7a26, transparent: true, opacity: 0.82,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const flames = [];
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 7, 1, true), flameMat.clone());
      f.position.set((Math.random() - 0.5) * 0.34, 0.3 + Math.random() * 0.2, (Math.random() - 0.5) * 0.34);
      f.userData = { phase: Math.random() * 7, speed: 1.6 + Math.random() * 1.8, base: f.position.y };
      fire.add(f);
      flames.push(f);
    }
    const coreLight = new THREE.PointLight(0xff8a30, 30, 26, 2);
    coreLight.position.set(0, 0.45, 0);
    fire.add(coreLight);

    // A ring of hearth stones and a stacked woodpile, so the fire reads as a
    // camp rather than a flame burning in the middle of nowhere.
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x968a7c, roughness: 0.92, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19 + (i % 3) * 0.04, 0), stoneMat);
      st.position.set(Math.cos(a) * 1.05, 0.02, Math.sin(a) * 1.05);
      st.rotation.set(i * 1.3, i * 2.1, i * 0.7);
      st.scale.set(1, 0.7, 1);
      st.castShadow = true; st.receiveShadow = true;
      fire.add(st);
    }
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 1.5, 7), woodMat);
      const row = Math.floor(i / 4);
      w.position.set(-2.7 + (i % 4) * 0.19, 0.09 + row * 0.16, -0.7 + row * 0.1);
      w.rotation.z = Math.PI / 2;
      w.rotation.y = 0.35 + row * 0.12;
      w.castShadow = true;
      fire.add(w);
    }

    const sparks = createMotes(scene, {
      count: 170, box: 22, color: [1, 0.33, 0.09], size: 1.1,
      rise: 0.55, opacity: 0.42, sway: 0.9,
    });
    const smoke = createMotes(scene, {
      count: 90, box: 20, color: [0.3, 0.26, 0.24], size: 9,
      rise: 0.3, opacity: 0.1, sway: 1.4, blending: THREE.NormalBlending,
    });

    function buildEmber() {
      const g = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(0.0125, 1);
      // Rough it up so it reads as charcoal rather than a bead.
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = 0.78 + Math.random() * 0.44;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.86, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        color: 0x241004, roughness: 0.82, metalness: 0.0,
        emissive: new THREE.Color(0xffd48a), emissiveIntensity: 1.35,
      });
      const core = new THREE.Mesh(geo, mat);
      g.add(core);

      // A soft additive halo so the glow survives the bloom threshold.
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.023, 16, 14),
        new THREE.MeshBasicMaterial({
          color: 0xffce92, transparent: true, opacity: 0.32,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
      );
      g.add(halo);

      const light = markLight(new THREE.PointLight(0xffc880, 0.030, 0.75, 2));
      g.add(light);

      g.userData = { mat, halo, light, core };
      return g;
    }

    const prop = new TrialProp({ scene, handRig, build: buildEmber, dropHeight: 0.22, drift: 0.05 });
    let phase = 'rest';

    return {
      onPhase(p, ctx) {
        phase = p;
        if (p === 'rest') prop.spawn(ctx.side);
        else if (p === 'cue') audio.tone(210, 0.3, 0.03, 'sawtooth');
        else if (p === 'flex') prop.grasp();
        else if (p === 'hold') audio.tone(150, 0.6, 0.02, 'triangle');
        else if (p === 'extend') prop.beginDepart();
        else if (p === 'iti') prop.dispose();
      },

      update(dt, t, s) {
        sparks.update(t);
        smoke.update(t);

        for (const f of flames) {
          const u = f.userData;
          const flick = Math.sin(t * u.speed + u.phase);
          f.scale.set(0.8 + flick * 0.18, 1 + flick * 0.34, 0.8 + flick * 0.18);
          f.position.y = u.base + flick * 0.06;
          f.material.opacity = 0.44 + (flick * 0.5 + 0.5) * 0.36;
          f.rotation.y = t * 0.5 + u.phase;
        }
        coreLight.intensity = 24 + Math.sin(t * 5.3) * 4.5 + Math.sin(t * 11.1) * 2.0;

        const o = prop.obj;
        if (!o) return;
        const { mat, halo, light } = o.userData;

        if (phase === 'rest') {
          prop.descend(s.progress, 0.012, t);
          o.rotation.y += dt * 1.6;
          o.rotation.x += dt * 0.9 * (1 - s.progress);
          const k = 0.5 + s.progress * 0.5;
          mat.emissiveIntensity = 1.35 * k;
          light.intensity = 0.030 * k;
        } else if (phase === 'cue') {
          // Landed and settling: a brief flare so the cue still reads as an event.
          const settle = 1 + (1 - s.progress) * 0.6;
          mat.emissiveIntensity = 1.4 * settle;
          light.intensity = 0.034 * settle;
        } else if (phase === 'flex') {
          const breathe = 0.9 + Math.sin(t * 4.2) * 0.1;
          mat.emissiveIntensity = 1.4 * breathe;
          light.intensity = 0.034 * breathe;
          halo.material.opacity = 0.32 * breathe;
        } else if (phase === 'hold') {
          // Enclosed and drawing air: the fist glows from the inside.
          const swell = easeOut(Math.min(1, s.progress * 2.2));
          const flick = 0.86 + Math.sin(t * 9.4) * 0.09 + Math.sin(t * 3.1) * 0.05;
          mat.emissiveIntensity = (1.4 + swell * 1.7) * flick;
          light.intensity = (0.034 + swell * 0.055) * flick;
          light.distance = 0.8;
          halo.material.opacity = (0.32 + swell * 0.26) * flick;
        } else if (phase === 'extend') {
          // Rises on its own heat.
          prop.depart(s.progress, { rise: 0.85, sway: 0.09, time: t });
          o.rotation.y += dt * 1.1;
          const cool = 1 - easeOut(s.progress) * 0.45;
          mat.emissiveIntensity = 3.0 * cool;
        }
      },

      onFinish() { prop.dispose(); },
    };
  },
};
