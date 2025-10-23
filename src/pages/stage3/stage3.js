import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FollowerNPC } from './FollowerNPC.js';
import { ChaserNPC } from './ChaserNPC.js';
import { Building } from './Building.js';
import { Player } from './Player.js';

import hero from "../../../src/assets/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import witch from "../../../src/assets/models/witch/witch_Idle.fbx";
import kid from "../../../src/assets/models/kid2/Idle.fbx";
import groundTexture from "../../../public/2025-10-23 123028.png";

// === LOADING SCREEN ===
const loadingScreen = document.getElementById('loadingScreen');
if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === GLOBAL STATE ===
let world, physicsReady = false;
let player, npc1, npc2;
let building;
let offset = 40;
let loadingComplete = false;

// === INITIALIZE RAPIER ===
await RAPIER.init();

// === SCENE SETUP ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070e17);
// scene.fog = new THREE.FogExp2(0x0e1c2e,0.005);
// scene.fog = new THREE.FogExp2(0x666666,0.003);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// === LIGHTING ===
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

// === FLAT GROUND ===
const groundSize = 5000;
const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
groundGeometry.rotateX(-Math.PI / 2);

// Load your texture
const textureLoader = new THREE.TextureLoader();
const colorMap = textureLoader.load(groundTexture); 
colorMap.repeat.set(200, 200);

// Optionally, set the texture wrapping mode to repeat
colorMap.wrapS = THREE.RepeatWrapping;  // Repeat horizontally (S axis)
colorMap.wrapT = THREE.RepeatWrapping;  // Repeat vertically (T axis)

const groundMaterial = new THREE.MeshStandardMaterial({
  map: colorMap,
  roughness: 0.9,
  metalness: 0.1
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.receiveShadow = true;
ground.position.y = 0;
scene.add(ground);

// === PHYSICS SETUP ===
function setupPhysics() {
  const gravity = { x: 0.0, y: -10, z: 0.0 };
  world = new RAPIER.World(gravity);
  
  // Flat ground collider (large thin box)
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.1, groundSize / 2)
    .setTranslation(0, -0.1, 0);
  world.createCollider(groundColliderDesc);
  
  physicsReady = true;
}
setupPhysics();

// === YUKA & ANIMATION ===
const entityManager = new YUKA.EntityManager();
const time = new YUKA.Time();
const mixers = [];
const projectiles = [];

// === ASSET LOADERS ===
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

// Helper function to detect file type from path
function getFileExtension(path) {
  return path.split('.').pop().toLowerCase();
}

async function loadModel(path, scale = 1, rotation = new THREE.Euler(0, Math.PI, 0), position = new THREE.Vector3(0, 0, 0)) {
  return new Promise((resolve, reject) => {
    const extension = getFileExtension(path);
    
    const onLoad = (object) => {
      // Handle GLTF/GLB format (has a scene property)
      if (object.scene) {
        object = object.scene;
      }
      
      object.scale.set(scale, scale, scale);
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
    };
    
    const onError = (error) => {
      console.error(`Failed to load model: ${path}`, error);
      reject(error);
    };
    
    // Choose loader based on file extension
    switch (extension) {
      case 'fbx':
        fbxLoader.load(path, onLoad, undefined, onError);
        break;
      case 'glb':
      case 'gltf':
        gltfLoader.load(path, onLoad, undefined, onError);
        break;
      case 'obj':
        objLoader.load(path, onLoad, undefined, onError);
        break;
      default:
        reject(new Error(`Unsupported file format: ${extension}`));
    }
  });
}

async function loadAnimation(path) {
  return new Promise((resolve, reject) => {
    const extension = getFileExtension(path);
    
    const onLoad = (object) => {
      let animations = [];
      
      // Handle GLTF/GLB format
      if (object.animations) {
        animations = object.animations;
      }
      
      if (animations && animations.length > 0) {
        resolve(animations[0]);
      } else {
        reject(new Error(`No animations in ${path}`));
      }
    };
    
    const onError = (error) => {
      console.error(`Failed to load animation: ${path}`, error);
      reject(error);
    };
    
    // Choose loader based on file extension
    switch (extension) {
      case 'fbx':
        fbxLoader.load(path, onLoad, undefined, onError);
        break;
      case 'glb':
      case 'gltf':
        gltfLoader.load(path, onLoad, undefined, onError);
        break;
      case 'obj':
        reject(new Error('OBJ files do not support animations'));
        break;
      default:
        reject(new Error(`Unsupported file format for animations: ${extension}`));
    }
  });
}

// === INPUT ===
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  p: false
};

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === GAME INITIALIZATION ===
async function initGame() {
  try {

    building = new Building({
      position: { x: -5, y: 13, z: 0 }, // Example position - adjust as needed
      scale: 10, // Adjust scale to fit scene
      world,
      scene,
      loadModel
    });

    // Create entities – they start loading immediately
    player = new Player({
      position: { x: 0, y: 0, z: 0 + offset },
      modelPath: hero,
      maxSpeed: 8,
      moveForce: 30,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation,
      projectiles
    });

    npc1 = new FollowerNPC({
      position: { x: -5, y: 0, z: -8 + offset },
      modelPath: kid,
      maxSpeed: 20,
      followDistance: 30,
      stopThreshold: 40,
      target: player,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation
    });

    npc2 = new ChaserNPC({
      position: { x: -10, y: 0, z: 100 + offset },
      modelPath: witch,
      maxSpeed: 20,
      stopDistance: 60,
      target: player,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation
    });

    // Wait for ALL models to finish loading
    await Promise.all([
      player.loadPromise,
      npc1.loadPromise,
      npc2.loadPromise,
      building.loadPromise
    ]);

    console.log("All models loaded. Starting game...");
    loadingComplete = true;
    loadingScreen.style.display = 'none';

    // Start animation loop
    animate();

  } catch (error) {
    console.error("Failed to load assets:", error);
    loadingScreen.innerHTML = `<h2>Loading Failed</h2><p>Please refresh and try again.</p>`;
  }
}

// === ANIMATION LOOP ===
function animate() {
  requestAnimationFrame(animate);

  if (!physicsReady || !loadingComplete) return;

  const delta = time.update().getDelta();

  // Update AI
  entityManager.update(delta);

  // Update entities
  player.handleInput(keys, delta);
  player.update(delta);
  npc1.update(delta);
  npc2.update(delta);
  npc2.updateIndicator();
  // building.update();

  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].update()) {
      projectiles[i].dispose();
      projectiles.splice(i, 1);
    }
  }

  // Step physics
  world.step();

  // Sync physics → visuals
  if (building.model) building.model.position.copy(building.rigidBody.translation());
  if (player.model) player.model.position.copy(player.rigidBody.translation());
  if (npc1.model) npc1.model.position.copy(npc1.rigidBody.translation());
  if (npc2.model) npc2.model.position.copy(npc2.rigidBody.translation());

  // Update animations
  mixers.forEach(mixer => mixer.update(delta));

  // Camera follow
  const playerPos = player.rigidBody.translation();
  const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.entity.rotation);
  const cameraDistance = 20;
  const cameraHeight = 15;

  const desiredPosition = new THREE.Vector3(
    playerPos.x - playerForward.x * cameraDistance,
    playerPos.y + cameraHeight,
    playerPos.z - playerForward.z * cameraDistance
  );

  camera.position.lerp(desiredPosition, 0.1);
  camera.lookAt(playerPos.x, playerPos.y + 3, playerPos.z);

  renderer.render(scene, camera);
}

// === START ===
initGame();