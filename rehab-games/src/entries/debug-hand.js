import * as THREE from 'three';
import { createHands } from '../hand.js';

// Diagnostic: one hand at three curl values, viewed from the side, with a
// marker sphere sitting at the grasp point. If the curl is correct the fingers
// close around the marker; if it is inverted they fold away from it.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202830);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.0));
const d = new THREE.DirectionalLight(0xffffff, 2.0); d.position.set(2, 4, 3); scene.add(d);

const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 10);

const rigs = [];
[0, 0.5, 1].forEach((curl, i) => {
  const holder = new THREE.Group();
  holder.position.x = (i - 1) * 0.30;
  scene.add(holder);
  const rig = createHands(holder, { spread: 0, height: 0, depth: 0, pitch: 0 });
  rig.hands.left.group.visible = false;
  rig.setCurl('right', curl);
  const mark = new THREE.Mesh(
    new THREE.SphereGeometry(0.010, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0x551008 })
  );
  rig.hands.right.grasp.add(mark);
  rigs.push(rig);
});

// Side-on: +X is to the right of frame, world +Y up.
const view = new URLSearchParams(location.search).get('view') || 'side';
if (view === 'side') cam.position.set(0.85, 0.16, 0.02);
else if (view === 'front') cam.position.set(0, 0.18, 0.60);
else cam.position.set(0.45, 0.55, 0.45);
cam.lookAt(0, 0.02, 0);

renderer.render(scene, cam);
window.__ready = true;
