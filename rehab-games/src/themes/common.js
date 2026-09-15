import * as THREE from 'three';
import { easeOut, easeIn, easeInOut } from '../world.js';

/**
 * Shared per-trial choreography.
 *
 * The object always comes to the hand — never the other way round. It is
 * created at cue onset, descends so that it lands in the open palm exactly as
 * the flex phase begins, rides the closing fist, and leaves during extend.
 * Because the movement is open-loop, the grasp can never miss.
 */
export class TrialProp {
  constructor({ scene, handRig, build, dropHeight = 0.24, drift = 0.05 }) {
    this.scene = scene;
    this.handRig = handRig;
    this.build = build;
    this.dropHeight = dropHeight;
    this.drift = drift;
    this.obj = null;
    this.side = 'left';
    this.landing = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.departing = false;
    this.departFrom = new THREE.Vector3();
  }

  spawn(side) {
    this.dispose();
    this.side = side;
    this.obj = this.build();
    this.handRig.graspPoint(side, this.landing);
    this.origin.copy(this.landing);
    this.origin.y += this.dropHeight;
    this.origin.x += (side === 'left' ? -1 : 1) * this.drift;
    this.origin.z -= this.drift * 0.6;
    this.obj.position.copy(this.origin);
    this.scene.add(this.obj);
    this.departing = false;
    return this.obj;
  }

  /** Call every frame of the cue phase; t is 0..1 through the cue. */
  descend(t, wobble = 0, time = 0) {
    if (!this.obj) return;
    const e = easeInOut(Math.min(1, t));
    this.obj.position.lerpVectors(this.origin, this.landing, e);
    if (wobble > 0) {
      const fade = 1 - e;
      this.obj.position.x += Math.sin(time * 5.1) * wobble * fade;
      this.obj.position.z += Math.cos(time * 4.3) * wobble * fade;
    }
  }

  /** At flex onset: hand it over so the object rides the closing fingers. */
  grasp() {
    if (!this.obj) return;
    this.obj.position.copy(this.landing);
    this.handRig.attach(this.side, this.obj);
  }

  /** At extend onset: give it back to the world before it leaves. */
  beginDepart() {
    if (!this.obj) return;
    this.handRig.detach(this.side, this.scene);
    this.departing = true;
    this.departFrom.copy(this.obj.position);
  }

  /** Call every frame of extend; t is 0..1. Rises and fades out. */
  depart(t, { rise = 0.5, sway = 0.06, time = 0, spin = 0 } = {}) {
    if (!this.obj || !this.departing) return;
    const e = easeIn(Math.min(1, t));
    this.obj.position.y = this.departFrom.y + e * rise;
    this.obj.position.x = this.departFrom.x + Math.sin(time * 2.2) * sway * e;
    this.obj.position.z = this.departFrom.z + Math.cos(time * 1.7) * sway * e - e * 0.08;
    if (spin) this.obj.rotation.y += spin * 0.016;
    this.setOpacity(1 - easeOut(Math.min(1, t)));
  }

  /** Falls instead of rising — for droplets and anything gravity takes. */
  fall(t, { drop = 0.5, time = 0 } = {}) {
    if (!this.obj || !this.departing) return;
    const e = easeIn(Math.min(1, t));
    this.obj.position.y = this.departFrom.y - e * drop;
    this.obj.position.x = this.departFrom.x + Math.sin(time * 3) * 0.004;
    this.setOpacity(1 - easeIn(Math.min(1, t * 1.15)));
  }

  setOpacity(a) {
    if (!this.obj) return;
    this.obj.traverse((n) => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) { m.transparent = true; m.opacity = a; }
      }
      if (n.isLight) n.intensity = (n.userData.baseIntensity ?? n.intensity) * Math.max(0, a);
    });
  }

  dispose() {
    if (!this.obj) return;
    this.obj.removeFromParent();
    this.obj.traverse((n) => {
      if (n.isMesh) {
        n.geometry?.dispose();
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) m?.dispose();
      }
    });
    this.obj = null;
    this.departing = false;
  }
}

/** Remembers a light's authored intensity so fades can restore it. */
export function markLight(light) {
  light.userData.baseIntensity = light.intensity;
  return light;
}
