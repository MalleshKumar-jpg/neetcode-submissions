import * as THREE from 'three';

// Anatomically-proportioned procedural hand. Built in "finger space": +Y runs
// from wrist to fingertip, +Z is the dorsal (back-of-hand) side, X spreads
// across the knuckles from thumb side to pinky side.

const PALM_LEN = 0.086;

const FINGERS = [
  { x: -0.030, z: 0.004, splay: -0.16, len: 0.088, base: 0.0125, tip: 0.0092, joints: [0, 0.040, 0.066], curl: [1.00, 0.95, 0.85] },
  { x: -0.010, z: 0.008, splay: -0.05, len: 0.098, base: 0.0132, tip: 0.0096, joints: [0, 0.045, 0.074], curl: [1.05, 1.00, 0.90] },
  { x:  0.011, z: 0.006, splay:  0.05, len: 0.092, base: 0.0128, tip: 0.0092, joints: [0, 0.042, 0.069], curl: [1.00, 0.95, 0.85] },
  { x:  0.030, z: -0.002, splay: 0.17, len: 0.074, base: 0.0112, tip: 0.0082, joints: [0, 0.034, 0.056], curl: [0.90, 0.85, 0.75] },
];

// Flexion at full curl, per joint, in radians. Roughly MCP 83 deg, PIP 100,
// DIP 69 — a real closed fist is about 250 degrees summed, not the ~170 a
// single uniform angle gives you. Each finger scales these by its own factors.
const FLEX = [1.45, 1.75, 1.20];
const THUMB_FLEX = [0.95, 0.85];

const THUMB = { x: 0.033, y: 0.021, z: 0.006, len: 0.070, base: 0.0155, tip: 0.0105, joints: [0, 0.034], curl: [0.78, 0.72] };

// A rounded, tapered lathe — the shape of a finger segment chain.
function limbProfile(length, base, tip) {
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * base, -Math.cos(a) * base * 0.7));
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(THREE.MathUtils.lerp(base, tip, t), t * (length - tip)));
  }
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * tip, length - tip + Math.sin(a) * tip));
  }
  return new THREE.LatheGeometry(pts, 18);
}

function palmProfile() {
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 0.030, -Math.cos(a) * 0.030 * 0.8));
  }
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector2(THREE.MathUtils.lerp(0.030, 0.036, t), t * (PALM_LEN - 0.020)));
  }
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * 0.036, PALM_LEN - 0.020 + Math.sin(a) * 0.020));
  }
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(1.30, 1, 0.62); // flatten into a palm rather than a tube
  return g;
}

// Every vertex is weighted onto the bone whose segment it sits in, with a soft
// blend band across each joint so knuckles crease instead of pinching.
function skinToChain(geometry, boneIndices, jointYs, band) {
  const pos = geometry.attributes.position;
  const idx = new Uint16Array(pos.count * 4);
  const wgt = new Float32Array(pos.count * 4);
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    const w = new Array(boneIndices.length).fill(0);
    let placed = false;
    for (let j = 1; j < jointYs.length && !placed; j++) {
      const jy = jointYs[j];
      if (y < jy - band) { w[j - 1] = 1; placed = true; }
      else if (y < jy + band) {
        const t = (y - (jy - band)) / (2 * band);
        w[j - 1] = 1 - t; w[j] = t; placed = true;
      }
    }
    if (!placed) w[w.length - 1] = 1;
    for (let k = 0; k < 4; k++) {
      idx[v * 4 + k] = k < boneIndices.length ? boneIndices[k] : 0;
      wgt[v * 4 + k] = k < w.length ? w[k] : 0;
    }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
}

function skinToSingle(geometry, boneIndex) {
  const n = geometry.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const wgt = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { idx[v * 4] = boneIndex; wgt[v * 4] = 1; }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
}

function buildHand({ handedness, skinMaterial, sleeveMaterial }) {
  const n = handedness === 'left' ? 1 : -1;
  const group = new THREE.Group();
  const bones = [];
  const meshes = [];

  const root = new THREE.Bone();
  bones.push(root);
  group.add(root);

  const palmGeo = palmProfile();
  skinToSingle(palmGeo, 0);
  meshes.push(palmGeo);

  const chains = []; // { bones: [...], curl: [...] }

  const addDigit = (spec, isThumb) => {
    const geo = limbProfile(spec.len, spec.base, spec.tip);
    const chainBones = [];
    let parent = root;
    for (let j = 0; j < spec.joints.length; j++) {
      const b = new THREE.Bone();
      if (j === 0) {
        b.position.set(spec.x * n, isThumb ? spec.y : PALM_LEN * 0.94, spec.z);
        if (isThumb) { b.rotation.z = n * -0.86; b.rotation.x = -0.30; }
        else { b.rotation.z = spec.splay * n; }
      } else {
        b.position.set(0, spec.joints[j] - spec.joints[j - 1], 0);
      }
      parent.add(b);
      chainBones.push(b);
      bones.push(b);
      parent = b;
    }
    skinToChain(geo, chainBones.map((b) => bones.indexOf(b)), spec.joints, 0.014);
    // Bake the digit into hand space so its skin weights line up with the bones.
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(spec.x * n, isThumb ? spec.y : PALM_LEN * 0.94, spec.z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(isThumb ? -0.30 : 0, 0, isThumb ? n * -0.86 : spec.splay * n)
      ),
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    meshes.push(geo);
    chains.push({ bones: chainBones, curl: spec.curl, thumb: !!isThumb });
  };

  for (const f of FINGERS) addDigit(f, false);
  addDigit(THUMB, true);

  // The bind inverses are taken from the bones' world matrices, so they must
  // be current before the Skeleton is built — otherwise each digit gets its
  // rest offset applied twice and the fingers float off the palm.
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const geo of meshes) {
    const sm = new THREE.SkinnedMesh(geo, skinMaterial);
    sm.castShadow = true;
    sm.receiveShadow = true;
    group.add(sm);
    sm.bind(skeleton);
  }

  // Forearm receding out of frame, so the hands read as the viewer's own.
  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.048, 0.30, 20, 1, true),
    sleeveMaterial
  );
  forearm.position.set(0, -0.155, 0.004);
  forearm.castShadow = true;
  group.add(forearm);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.010, 10, 24), sleeveMaterial);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.012, 0.004);
  group.add(cuff);

  // Grasp point: just above the palm hollow, where an object comes to rest.
  const grasp = new THREE.Object3D();
  grasp.position.set(0, PALM_LEN * 0.52, -0.030);
  root.add(grasp);

  const rest = chains.map((c) => c.bones.map((b) => b.rotation.clone()));

  function setCurl(amount) {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    chains.forEach((chain, ci) => {
      chain.bones.forEach((bone, bi) => {
        const base = rest[ci][bi];
        const k = chain.curl[bi] ?? 1;
        if (chain.thumb) {
          // The thumb rolls across the palm rather than curling straight in.
          bone.rotation.x = base.x - a * k * (THUMB_FLEX[bi] ?? 0.85);
          bone.rotation.z = base.z + (bi === 0 ? n * a * 0.42 : 0);
        } else {
          // NEGATIVE X folds the digit toward the palmar side (-Z in build
          // space), which is where the grasp point sits. Positive X is
          // hyperextension: the fingers fold away and the object ends up
          // outside the fist.
          bone.rotation.x = base.x - a * k * (FLEX[bi] ?? 1.2);
        }
      });
    });
  }

  setCurl(0);
  return { group, root, grasp, setCurl, skeleton };
}

export const HAND_DEFAULTS = {
  skinColor: 0xd8a189,
  sleeveColor: 0x3c4a52,
  scale: 1.0,
  // Eccentricity of each hand from screen centre. Keep this small: objects far
  // into the periphery provoke saccades, and lateralised EOG is exactly what a
  // left/right classifier will learn instead of motor imagery.
  spread: 0.082,
  height: -0.145,
  depth: -0.52,
  pitch: 0.48,
  curlLimit: 1.0,
};

export function createHands(parent, opts = {}) {
  const o = { ...HAND_DEFAULTS, ...opts };

  const skin = new THREE.MeshPhysicalMaterial({
    color: o.skinColor,
    roughness: 0.58,
    clearcoat: 0.28,
    clearcoatRoughness: 0.55,
    sheen: 0.35,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0xe8b0a0),
    envMapIntensity: 0.75,
  });
  const sleeve = new THREE.MeshStandardMaterial({
    color: o.sleeveColor, roughness: 0.82, metalness: 0.03, side: THREE.DoubleSide,
  });

  const hands = {
    left: buildHand({ handedness: 'left', skinMaterial: skin, sleeveMaterial: sleeve }),
    right: buildHand({ handedness: 'right', skinMaterial: skin, sleeveMaterial: sleeve }),
  };

  for (const side of ['left', 'right']) {
    const h = hands[side];
    const s = side === 'left' ? -1 : 1;
    h.group.scale.setScalar(o.scale);
    h.group.position.set(s * o.spread, o.height, o.depth);
    // -PI/2 tips the fingers forward; PI rolls the palm face-up.
    h.group.rotation.set(-Math.PI / 2 + o.pitch, Math.PI, s * -0.14);
    parent.add(h.group);
  }

  const curl = { left: 0, right: 0 };
  const held = { left: null, right: null };
  const tmp = new THREE.Vector3();

  return {
    hands,
    materials: { skin, sleeve },
    setCurl(side, v) {
      const limited = v * o.curlLimit;
      curl[side] = limited;
      hands[side].setCurl(limited);
    },
    getCurl(side) { return curl[side]; },
    graspPoint(side, target = new THREE.Vector3()) {
      hands[side].grasp.getWorldPosition(target);
      return target;
    },
    attach(side, obj) {
      hands[side].grasp.attach(obj);
      held[side] = obj;
    },
    detach(side, newParent) {
      const obj = held[side];
      if (!obj) return null;
      if (newParent) newParent.attach(obj);
      held[side] = null;
      return obj;
    },
    held,
    // Idle: a slow breath so the hands never look like a frozen still.
    update(t) {
      for (const side of ['left', 'right']) {
        const h = hands[side];
        const s = side === 'left' ? -1 : 1;
        h.group.position.y = o.height + Math.sin(t * 0.55 + s) * 0.0022;
        h.group.rotation.z = s * -0.14 + Math.sin(t * 0.42 + s * 2) * 0.006;
      }
      void tmp;
    },
  };
}
