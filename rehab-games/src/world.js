import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 1831565813) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * valueNoise(x * freq, y * freq); freq *= lacunarity; amp *= gain; }
  return sum;
}

/**
 * Rolling ground plane with optional scattered rocks and grass blades.
 * Returns the group plus a height(x,z) sampler so themes can sit props on it.
 */
export function createTerrain(parent, {
  color = 0x3a5a42, size = 180, amplitude = 2.2, offsetY = -1.6, frequency = 0.035,
  rocks = 0, rockColor = 0x51574f, rockScale = 1.0, rockSink = 0.3, grass = 0, grassColor = 0x2f5135,
  grassHeight = 0.5, roughness = 0.95, seed = 7, segments = 110,
} = {}) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  const height = (x, z) => fbm(x * frequency, z * frequency, 4) * amplitude + offsetY;

  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness }));
  ground.receiveShadow = true;
  group.add(ground);

  if (rocks > 0) {
    const inst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.94, flatShading: true }),
      rocks
    );
    const m = new THREE.Object3D();
    for (let i = 0; i < rocks; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * (size * 0.34);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = (0.3 + rng() * 1.2) * rockScale;
      m.position.set(x, height(x, z) + s * rockSink, z);
      m.rotation.set(rng() * 3, rng() * 6.28, rng() * 0.5);
      m.scale.set(s, s * (0.5 + rng() * 0.45), s);
      m.updateMatrix();
      inst.setMatrixAt(i, m.matrix);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    group.add(inst);
  }

  if (grass > 0) {
    // A flat quad reads as a floating slab. Taper it to a point and give it a
    // slight lean so the field looks like grass rather than confetti.
    const blade = (() => {
      const w = 0.030, h = grassHeight;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        -w, 0, 0, w, 0, 0, -w * 0.55, h * 0.55, 0,
        w, 0, 0, w * 0.55, h * 0.55, 0, -w * 0.55, h * 0.55, 0,
        -w * 0.55, h * 0.55, 0, w * 0.55, h * 0.55, 0, 0, h, 0,
      ], 3));
      g.computeVertexNormals();
      return g;
    })();
    const inst = new THREE.InstancedMesh(
      blade,
      new THREE.MeshStandardMaterial({ color: grassColor, roughness: 0.9, side: THREE.DoubleSide }),
      grass
    );
    const m = new THREE.Object3D();
    for (let i = 0; i < grass; i++) {
      const a = rng() * Math.PI * 2, r = 1.0 + rng() * 22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      m.position.set(x, height(x, z) - 0.02, z);
      m.rotation.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.4);
      const s = 0.55 + rng() * 0.75;
      m.scale.set(s, s, s);
      m.updateMatrix();
      inst.setMatrixAt(i, m.matrix);
    }
    group.add(inst);
  }

  parent.add(group);
  return { group, height };
}

/**
 * Drifting motes — dust, snow, silt, marine snow, sparks. One draw call.
 */
export function createMotes(parent, {
  count = 220, box = 26, color = [0.9, 0.95, 1], size = 3, rise = -0.1,
  opacity = 0.5, sway = 0.9, blending = THREE.AdditiveBlending,
} = {}) {
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box;
    pos[i * 3 + 1] = (Math.random() - 0.5) * box;
    pos[i * 3 + 2] = (Math.random() - 0.5) * box;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBox: { value: box }, uRise: { value: rise },
      uSize: { value: size }, uColor: { value: new THREE.Vector3(...color) },
      uOpacity: { value: opacity }, uSway: { value: sway },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime, uBox, uRise, uSize, uSway;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(position.y + uTime * uRise, uBox) - uBox * 0.5;
        p.x += sin(uTime * 0.15 + aSeed * 20.0) * uSway;
        p.z += cos(uTime * 0.12 + aSeed * 20.0) * uSway;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float camDist = max(-mv.z, 1.5);
        gl_PointSize = min(uSize * (240.0 / camDist) * (0.6 + aSeed * 0.8), 32.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = smoothstep(0.0, 3.0, -mv.z) * smoothstep(uBox * 0.8, uBox * 0.22, -mv.z);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float a = smoothstep(1.0, 0.0, d) * vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, blending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  parent.add(points);
  return { points, material: mat, update(t) { mat.uniforms.uTime.value = t; } };
}

/** Bare or leafy trunks receding into fog, instanced. */
export function createTrunks(parent, {
  count = 26, color = 0x2b2420, innerRadius = 7, outerRadius = 42,
  minHeight = 5, maxHeight = 11, radius = 0.22, seed = 11, height,
} = {}) {
  const rng = makeRng(seed);
  const geo = new THREE.CylinderGeometry(radius * 0.6, radius, 1, 8, 1);
  geo.translate(0, 0.5, 0);
  const inst = new THREE.InstancedMesh(
    geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), count
  );
  const m = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = innerRadius + rng() * (outerRadius - innerRadius);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = minHeight + rng() * (maxHeight - minHeight);
    m.position.set(x, height ? height(x, z) - 0.2 : -1.6, z);
    m.rotation.set((rng() - 0.5) * 0.08, rng() * 6.28, (rng() - 0.5) * 0.08);
    m.scale.set(0.7 + rng() * 0.7, h, 0.7 + rng() * 0.7);
    m.updateMatrix();
    inst.setMatrixAt(i, m.matrix);
  }
  inst.castShadow = true;
  parent.add(inst);
  return inst;
}

/**
 * Branching trees, merged to one geometry and instanced. Bare cylinders read
 * as fence posts at distance; a forked silhouette is what makes a treeline
 * look like a treeline.
 */
export function createTrees(parent, {
  count = 26, color = 0x2b2420, innerRadius = 8, outerRadius = 44,
  minHeight = 5, maxHeight = 11, trunkRadius = 0.035, branches = 7,
  canopyColor = null, canopyCount = 0, canopyRadius = 1.6,
  seed = 11, height, roughness = 0.95,
} = {}) {
  const rng = makeRng(seed);
  const parts = [];

  const trunk = new THREE.CylinderGeometry(trunkRadius * 0.34, trunkRadius, 1, 7, 1);
  trunk.translate(0, 0.5, 0);
  parts.push(trunk);

  for (let i = 0; i < branches; i++) {
    const up = 0.34 + rng() * 0.56;          // where it leaves the trunk
    const len = 0.30 + rng() * 0.42;
    const tilt = 0.5 + rng() * 0.75;
    const yaw = rng() * Math.PI * 2;
    const r = trunkRadius * (0.34 + (1 - up) * 0.4);
    const b = new THREE.CylinderGeometry(r * 0.28, r * 0.8, len, 5, 1);
    b.translate(0, len / 2, 0);
    b.rotateZ(tilt);
    b.rotateY(yaw);
    b.translate(0, up, 0);
    parts.push(b);
    // One fork per branch keeps the silhouette from looking like a bottle brush.
    if (rng() > 0.45) {
      const l2 = len * (0.45 + rng() * 0.4);
      const f = new THREE.CylinderGeometry(r * 0.16, r * 0.34, l2, 5, 1);
      f.translate(0, l2 / 2, 0);
      f.rotateZ(tilt + (rng() - 0.5) * 0.8);
      f.rotateY(yaw + (rng() - 0.5) * 1.1);
      f.translate(Math.sin(tilt) * len * 0.8 * Math.cos(yaw), up + Math.cos(tilt) * len * 0.8,
                  -Math.sin(tilt) * len * 0.8 * Math.sin(yaw));
      parts.push(f);
    }
  }

  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  const inst = new THREE.InstancedMesh(
    geo, new THREE.MeshStandardMaterial({ color, roughness, flatShading: false }), count
  );
  const m = new THREE.Object3D();
  const placed = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = innerRadius + rng() * (outerRadius - innerRadius);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = minHeight + rng() * (maxHeight - minHeight);
    m.position.set(x, height ? height(x, z) - 0.15 : -1.6, z);
    m.rotation.set((rng() - 0.5) * 0.06, rng() * 6.28, (rng() - 0.5) * 0.06);
    // Uniform scale only. A non-uniform instance scale stretches the branches
    // along Y and squashes them in X/Z, which turns a crown into vertical
    // splinters — girth has to come from trunkRadius, not from the transform.
    m.scale.set(h * (0.98 + rng() * 0.04), h, h * (0.98 + rng() * 0.04));
    m.updateMatrix();
    inst.setMatrixAt(i, m.matrix);
    placed.push({ x, z, h, y: m.position.y });
  }
  inst.castShadow = true;
  parent.add(inst);

  if (canopyColor !== null && canopyCount > 0) {
    const blob = new THREE.IcosahedronGeometry(1, 1);
    const canopy = new THREE.InstancedMesh(
      blob, new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.92, flatShading: true }),
      canopyCount
    );
    for (let i = 0; i < canopyCount; i++) {
      const t = placed[i % placed.length];
      const s2 = canopyRadius * (0.55 + rng() * 0.5) * (t.h / maxHeight);
      const spreadR = t.h * 0.16;
      m.position.set(
        t.x + (rng() - 0.5) * spreadR * 2,
        t.y + t.h * (0.62 + rng() * 0.36),
        t.z + (rng() - 0.5) * spreadR * 2
      );
      m.rotation.set(rng() * 3, rng() * 6, rng() * 3);
      m.scale.set(s2, s2 * 0.75, s2);
      m.updateMatrix();
      canopy.setMatrixAt(i, m.matrix);
    }
    parent.add(canopy);
  }

  return inst;
}

/**
 * Scatter one prop geometry across the ground as a single instanced draw.
 * Used for ferns, mushrooms, flowers, firewood, stones — the small stuff that
 * makes a scene feel inhabited instead of empty.
 */
export function createScatter(parent, {
  geometry, material, count = 40, innerRadius = 1.2, outerRadius = 22,
  height, minScale = 0.7, maxScale = 1.3, seed = 3, sink = 0,
  tilt = 0.25, avoidCentre = 0,
} = {}) {
  const rng = makeRng(seed);
  const inst = new THREE.InstancedMesh(geometry, material, count);
  const m = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      const a = rng() * Math.PI * 2;
      const r = innerRadius + rng() * (outerRadius - innerRadius);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      tries++;
    } while (avoidCentre > 0 && Math.abs(x) < avoidCentre && z > -outerRadius && z < 0 && tries < 8);
    const sc = minScale + rng() * (maxScale - minScale);
    m.position.set(x, (height ? height(x, z) : -1.5) - sink * sc, z);
    m.rotation.set((rng() - 0.5) * tilt, rng() * Math.PI * 2, (rng() - 0.5) * tilt);
    m.scale.setScalar(sc);
    m.updateMatrix();
    inst.setMatrixAt(i, m.matrix);
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  parent.add(inst);
  return inst;
}

/** A fern frond: a stem with paired leaflets, merged to one geometry. */
export function fernGeometry(leaflets = 9, length = 0.55) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.006, 0.010, length, 5);
  stem.translate(0, length / 2, 0);
  stem.rotateX(0.25);
  parts.push(stem);
  for (let i = 0; i < leaflets; i++) {
    const t = 0.18 + (i / leaflets) * 0.78;
    const size = (1 - t * 0.72) * 0.19;
    for (const side of [-1, 1]) {
      const leaf = new THREE.PlaneGeometry(size, size * 0.34, 1, 1);
      leaf.translate(side * size * 0.5, 0, 0);
      leaf.rotateZ(side * -0.5);
      leaf.rotateY(side * 0.2);
      leaf.translate(0, t * length, Math.sin(0.25) * t * length * -0.5);
      parts.push(leaf);
    }
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/** A small capped mushroom. */
export function mushroomGeometry(capRadius = 0.05, stemHeight = 0.07) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(capRadius * 0.24, capRadius * 0.32, stemHeight, 7);
  stem.translate(0, stemHeight / 2, 0);
  parts.push(stem);
  const cap = new THREE.SphereGeometry(capRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(1, 0.62, 1);
  cap.translate(0, stemHeight, 0);
  parts.push(cap);
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
