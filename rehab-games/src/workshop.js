import * as THREE from 'three';

/**
 * Near-field workspace scenes.
 *
 * These follow the design doc's clutter rule (2.6): the area around the hands
 * is kept to a handful of objects, and anything decorative is pushed far back,
 * low-contrast and static. "Not empty" comes from light and material quality,
 * not object count.
 */

/** A work surface in front of the patient, plus a plain backdrop. */
export function createWorkbench(parent, {
  surfaceColor = 0x8a6a48, surfaceRoughness = 0.72,
  backdropColor = 0xb9ad9a, y = -0.32, depth = -1.0,
  width = 2.6, length = 1.9, thickness = 0.06,
  backdropDistance = -3.6, backdropHeight = 6, floorColor = 0x9c9184,
} = {}) {
  const group = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, length),
    new THREE.MeshStandardMaterial({ color: surfaceColor, roughness: surfaceRoughness, metalness: 0.02 })
  );
  top.position.set(0, y, depth);
  top.receiveShadow = true;
  group.add(top);

  // A front edge gives the surface a readable near boundary.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness * 1.6, thickness),
    new THREE.MeshStandardMaterial({ color: surfaceColor, roughness: surfaceRoughness + 0.08 })
  );
  lip.position.set(0, y - thickness * 0.35, depth + length / 2);
  group.add(lip);

  // Legs, or the surface reads as a plank hanging in mid air.
  const legMat = new THREE.MeshStandardMaterial({ color: surfaceColor, roughness: surfaceRoughness + 0.1 });
  const legH = y - thickness / 2 - (-1.6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, legH, 0.075), legMat);
      leg.position.set(sx * (width / 2 - 0.10), y - thickness / 2 - legH / 2, depth + sz * (length / 2 - 0.10));
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(28, backdropHeight),
    new THREE.MeshStandardMaterial({ color: backdropColor, roughness: 0.95 })
  );
  backdrop.position.set(0, backdropHeight / 2 - 1.6, backdropDistance);
  group.add(backdrop);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.96 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.6, backdropDistance / 2);
  floor.receiveShadow = true;
  group.add(floor);

  parent.add(group);
  return { group, surfaceY: y + thickness / 2, depth };
}

/**
 * Squeeze deformation driven by the grip.
 *
 * The fingers close across the object's local X, so it compresses on that axis
 * and bulges on the others, with shallow grooves where the fingers press.
 * Normals are corrected for the axis scaling — the groove normals are left
 * approximate, which matte clay and husk hide.
 */
export function applySqueeze(material, {
  squash = 0.42, bulge = 0.20, grooves = 0.030, bands = 34, axis = 'z',
} = {}) {
  const uniforms = { uSqueeze: { value: 0 } };
  const sq = squash.toFixed(3), b1 = bulge.toFixed(3), b2 = (bulge * 0.82).toFixed(3);
  const scaleExpr = axis === 'x'
    ? `vec3(1.0 - ${sq} * s, 1.0 + ${b1} * s, 1.0 + ${b2} * s)`
    : axis === 'y'
      ? `vec3(1.0 + ${b1} * s, 1.0 - ${sq} * s, 1.0 + ${b2} * s)`
      : `vec3(1.0 + ${b1} * s, 1.0 + ${b2} * s, 1.0 - ${sq} * s)`;
  const grooveAxis = axis === 'z' ? 'z' : axis === 'y' ? 'y' : 'x';
  const alongAxis = axis === 'z' ? 'y' : 'x';

  material.onBeforeCompile = (sh) => {
    sh.uniforms.uSqueeze = uniforms.uSqueeze;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uSqueeze;
        vec3 squeezeScale(float s) { return ${scaleExpr}; }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(objectNormal / squeezeScale(uSqueeze));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed *= squeezeScale(uSqueeze);
        // Shallow finger grooves running across the grip.
        float g = sin(transformed.${alongAxis} * ${bands.toFixed(1)}) * ${grooves.toFixed(4)} * uSqueeze;
        transformed.${grooveAxis} -= sign(transformed.${grooveAxis}) * g;`);
  };
  material.userData.squeezeUniforms = uniforms;
  return uniforms;
}

/** Irregular lump geometry — clay, dough, a husk. */
export function lumpGeometry(radius = 0.030, detail = 3, jitter = 0.16, rng = Math.random) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 41) * Math.sin(v.y * 37) * Math.sin(v.z * 43);
    v.multiplyScalar(1 + n * jitter);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  void rng;
  return geo;
}

/**
 * A pile that grows across the session — the finished pieces, the seeds, the
 * collected work. Kept on the midline so it never pulls the gaze sideways.
 */
export class Accumulator {
  constructor(parent, { geometry, material, capacity = 48, place }) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // The object itself sits at the origin while its instances are placed a
    // metre away by their matrices. Culling only sees the origin-centred
    // bounding sphere — which is at the camera — so the whole pile vanishes.
    this.mesh.frustumCulled = false;
    this.capacity = capacity;
    this.place = place;
    this.n = 0;
    this.dummy = new THREE.Object3D();
    parent.add(this.mesh);
  }

  add() {
    if (this.n >= this.capacity) return;
    this.place(this.dummy, this.n);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.n, this.dummy.matrix);
    this.n += 1;
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() { this.n = 0; this.mesh.count = 0; }
}
