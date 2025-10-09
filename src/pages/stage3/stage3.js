import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Player } from './Player.js';
import { FollowerNPC } from './FollowerNPC.js';
import { ChaserNPC } from './ChaserNPC.js';

// Initialize Rapier physics
let world, physicsReady = false;

await RAPIER.init();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 25);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
scene.add(directionalLight);

// Simple noise function (Perlin-like)
function noise(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  
  const hash = (x, y) => {
    const h = (x * 374761393 + y * 668265263) & 0x7fffffff;
    return (h ^ (h >> 13)) / 0x7fffffff;
  };
  
  const u = fade(xf);
  const v = fade(yf);
  
  const a = hash(X, Y);
  const b = hash(X + 1, Y);
  const c = hash(X, Y + 1);
  const d = hash(X + 1, Y + 1);
  
  return lerp(v, lerp(u, a, b), lerp(u, c, d));
}

function getTerrainHeight(x, z) {
  let height = 0;
  let amplitude = 4;
  let frequency = 0.05;
  
  for (let i = 0; i < 4; i++) {
    height += noise(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  
  return height;
}

// Create terrain
const terrainSize = 1000;
const terrainSegments = 100;
const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeometry.rotateX(-Math.PI / 2);

const vertices = terrainGeometry.attributes.position.array;
for (let i = 0; i < vertices.length; i += 3) {
  const x = vertices[i];
  const z = vertices[i + 2];
  vertices[i + 1] = getTerrainHeight(x, z);
}

terrainGeometry.computeVertexNormals();

const terrainMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a7d44,
  flatShading: true
});

const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
terrain.receiveShadow = true;
scene.add(terrain);

// Setup Rapier physics world
function setupPhysics() {
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  world = new RAPIER.World(gravity);
  
  // Create terrain collider from the mesh
  const vertices = terrainGeometry.attributes.position.array;
  const indices = terrainGeometry.index ? terrainGeometry.index.array : null;
  
  // Create trimesh collider for terrain
  const terrainDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
  world.createCollider(terrainDesc);
  
  physicsReady = true;
}

setupPhysics();

// Yuka Entity Manager
const entityManager = new YUKA.EntityManager();
const time = new YUKA.Time();

// Animation mixer for models
const mixers = [];

// Projectile array
const projectiles = [];

// Function to load FBX model
async function loadModel(path, scale = 1, rotation = new THREE.Euler(0, Math.PI, 0), position = new THREE.Vector3(0, 0, 0)) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    // console.log(`Loading model: ${path}`);
    loader.load(
      path,
      (object) => {
        // console.log(`Model loaded successfully: ${path}`);
        object.scale.copy(scale instanceof THREE.Vector3 ? scale : new THREE.Vector3(scale, scale, scale));
        object.rotation.copy(rotation);
        object.position.copy(position);
        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(object);
        resolve(object);
      },
      undefined,
      (error) => {
        console.error(`Failed to load model: ${path}`, error);
        reject(error);
      }
    );
  });
}

// Function to load animation only
async function loadAnimation(path) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    // console.log(`Loading animation: ${path}`);
    loader.load(
      path,
      (object) => {
        const clips = object.animations;
        if (clips.length > 0) {
          // console.log(`Animation loaded successfully: ${path}`);
          resolve(clips[0]);
        } else {
          // console.error(`No animations found in: ${path}`);
          reject(new Error('No animations found in file'));
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load animation: ${path}`, error);
        reject(error);
      }
    );
  });
}

// Create entities
const player = new Player({
  position: { x: 0, y: 8, z: 0 },
  modelPath: './models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx',
  maxSpeed: 8,
  moveForce: 30,
  world,
  scene,
  mixers,
  entityManager,
  loadModel,
  loadAnimation,
  projectiles // Pass projectiles array
});

const npc1 = new FollowerNPC({
  position: { x: -10, y: 8, z: 10 },
  modelPath: './models/kid2/Idle.fbx',
  maxSpeed: 20,
  followDistance: 10,
  stopThreshold: 12,
  target: player,
  world,
  scene,
  mixers,
  entityManager,
  loadModel,
  loadAnimation
});

const npc2 = new ChaserNPC({
  position: { x: 20, y: 9, z: 20 },
  modelPath: './models/witch/witch_Idle.fbx',
  maxSpeed: 15,
  stopDistance: 25,
  target: player,
  world,
  scene,
  mixers,
  entityManager,
  loadModel,
  loadAnimation
});

// Input handling
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  p: false
};

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = false;
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  if (!physicsReady) return;
  
  const delta = time.update().getDelta();
  
  // Update player
  player.handleInput(keys, delta);
  player.update(delta);
  
  // Update NPCs
  npc1.update(delta);
  npc2.update(delta);
  npc2.updateIndicator();
  
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].update()) {
      projectiles[i].dispose();
      projectiles.splice(i, 1);
    }
  }
  
  // Update Yuka
  entityManager.update(delta);
  
  // Step physics simulation
  world.step();
  
  // Update mesh positions from physics
  player.model.position.copy(player.rigidBody.translation());
  npc1.model.position.copy(npc1.rigidBody.translation());
  npc2.model.position.copy(npc2.rigidBody.translation());
  
  // Update animations
  mixers.forEach(mixer => mixer.update(delta));
  
  // Smooth camera follow behind player
  const playerPos = player.rigidBody.translation();
  
  // Get player's forward direction
  const playerForward = new THREE.Vector3(0, 0, 1);
  playerForward.applyQuaternion(player.entity.rotation);
  
  // Calculate desired camera position behind player
  const cameraDistance = 25;
  const cameraHeight = 15;
  
  const desiredPosition = new THREE.Vector3(
    playerPos.x - playerForward.x * cameraDistance,
    playerPos.y + cameraHeight,
    playerPos.z - playerForward.z * cameraDistance
  );
  
  // Smoothly interpolate camera position
  const lerpFactor = 0.1;
  camera.position.lerp(desiredPosition, lerpFactor);
  
  // Look at player (slightly above their position)
  const lookAtTarget = new THREE.Vector3(playerPos.x, playerPos.y + 3, playerPos.z);
  camera.lookAt(lookAtTarget);
  
  // Debug rendering
  // console.log('Rendering frame - Scene children:', scene.children.length, 'Camera pos:', camera.position);
  renderer.render(scene, camera);
}

animate();