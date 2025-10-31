import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FollowerNPC } from './FollowerNPC.js';
import { ChaserNPC } from './ChaserNPC.js';
import { Building } from './Building.js';
import { Player } from './Player.js';

import hero from "../../../public/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import witch from "../../../public/models/witch/witch_Idle.fbx";
import kid from "../../../public/models/kid2/Idle.fbx";
import groundTexture from "../../../public/2025-10-23 123028.png";

import powerP from "../../../public/models/projectiles/rasengan.glb";
import powerL from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerO from "../../../public/models/projectiles/adorned_metal_sphere.glb";
import powerK from "../../../public/models/projectiles/low_poly_water_drop.glb";
import powerI from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerJ from "../../../public/models/projectiles/monocyte.glb";

import power0 from "../../../public/models/projectiles/blood_moon_grin.glb";
import power1 from "../../../public/models/projectiles/water_orb.glb";
import power2 from "../../../public/models/projectiles/blood_moon_grin.glb";
import power3 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power4 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power5 from "../../../public/models/projectiles/graveyard_fog_eyeball_-_blender_file.glb";

// === LOADING SCREEN & UI ===
const loadingScreen = document.getElementById('loadingScreen');
const healthUI = document.getElementById('healthUI');
const playerHealthFill = document.getElementById('playerHealthFill');
const playerHealthText = document.getElementById('playerHealthText');
const witchHealthFill = document.getElementById('witchHealthFill');
const witchHealthText = document.getElementById('witchHealthText');

if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === GLOBAL STATE ===
let world, physicsReady = false;
let player, npc1, npc2;
let building;
let indoorOffset = -120;
let outsideOffset = 50;
let doorOffset = -15;
let loadingComplete = false;
let gameOver = false;

// Preload cache for projectile models - MAKE GLOBALLY ACCESSIBLE
const projectileModelCache = new Map();
window.projectileModelCache = projectileModelCache;

// === INITIALIZE RAPIER ===
await RAPIER.init();

// === SCENE SETUP ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070e17);
scene.fog = new THREE.FogExp2(0x0e1c2e, 0.0025);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// === LIGHTING ===
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(80, 80, 30);
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

const textureLoader = new THREE.TextureLoader();
const colorMap = textureLoader.load(groundTexture); 
colorMap.repeat.set(200, 200);
colorMap.wrapS = THREE.RepeatWrapping;
colorMap.wrapT = THREE.RepeatWrapping;

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

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
gltfLoader.setDRACOLoader(dracoLoader);

function getFileExtension(path) {
  return path.split('.').pop().toLowerCase();
}

// Special load function for preloading (doesn't add to scene)
async function loadModelForCache(path) {
  return new Promise((resolve, reject) => {
    const extension = getFileExtension(path);
    
    const onLoad = (object) => {
      if (object.scene) {
        object = object.scene;
      }
      // Deep clone to ensure materials/geometries are independent
      const clonedModel = object.clone(true);
      resolve(clonedModel);
    };
    
    const onError = (error) => {
      reject(error);
    };
    
    switch (extension) {
      case 'glb':
      case 'gltf':
        gltfLoader.load(path, onLoad, undefined, onError);
        break;
      default:
        reject(new Error(`Unsupported file format: ${extension}`));
    }
  });
}

// Preload all projectile models
async function preloadProjectileModels() {
  const projectileModels = [
    powerP, powerL, powerO, powerK, powerI, powerJ,  // Player projectiles
    power0, power1, power2, power3, power4, power5   // Witch projectiles
  ];
  
  console.log('Preloading projectile models...');
  
  const loadPromises = projectileModels.map(async (modelPath) => {
    try {
      const model = await loadModelForCache(modelPath);
      // Ensure shadows are enabled on cached model
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      projectileModelCache.set(modelPath, model);
      console.log(`Preloaded: ${modelPath}`);
    } catch (error) {
      console.warn(`Failed to preload ${modelPath}:`, error);
    }
  });
  
  await Promise.all(loadPromises);
  console.log('All projectile models preloaded!');
}

async function loadModel(path, scale = 1, rotation = new THREE.Euler(0, Math.PI, 0), position = new THREE.Vector3(0, 0, 0)) {
  return new Promise((resolve, reject) => {
    const extension = getFileExtension(path);
    
    const onLoad = (object) => {
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
  Shift: false,
  i: false,
  j: false,
  k: false,
  o: false,
  p: false,
  l: false
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

// === UPDATE HEALTH UI ===
function updateHealthUI() {
  if (!player || !npc2) return;
  
  // Update player health
  const playerHealthPercent = (player.health / player.maxHealth) * 100;
  playerHealthFill.style.width = playerHealthPercent + '%';
  playerHealthText.textContent = `${Math.floor(player.health)} / ${player.maxHealth}`;
  
  // Add low health warning
  if (playerHealthPercent < 30) {
    playerHealthFill.parentElement.classList.add('health-low');
  } else {
    playerHealthFill.parentElement.classList.remove('health-low');
  }
  
  // Update witch health
  const witchHealthPercent = (npc2.health / npc2.maxHealth) * 100;
  witchHealthFill.style.width = witchHealthPercent + '%';
  witchHealthText.textContent = `${Math.floor(npc2.health)} / ${npc2.maxHealth}`;
  
  if (witchHealthPercent < 30) {
    witchHealthFill.parentElement.classList.add('health-low');
  } else {
    witchHealthFill.parentElement.classList.remove('health-low');
  }
}

// === CHECK GAME OVER ===
function checkGameOver() {
  if (gameOver) return;
  
  // Player died - Witch wins
  if (player.isDead && !gameOver) {
    gameOver = true;
    console.log('GAME OVER - Witch wins!');
    npc2.playVictoryAnimation();
    
    // Show game over after 5 seconds
    setTimeout(() => {
      showGameOverScreen(false);
    }, 5000);
  }
  
  // Witch died - Player wins
  if (npc2.isDead && !gameOver) {
    gameOver = true;
    console.log('VICTORY - Player wins!');
    
    // Show victory screen after 5 seconds
    setTimeout(() => {
      showGameOverScreen(true);
    }, 5000);
  }
}

// === SHOW GAME OVER SCREEN ===
function showGameOverScreen(playerWon) {
  // Create game over overlay
  const overlay = document.createElement('div');
  overlay.id = 'gameOverScreen';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 1s ease-in;
  `;
  
  // Title
  const title = document.createElement('h1');
  title.style.cssText = `
    font-family: 'DK Okiku', sans-serif;
    font-size: 5em;
    margin-bottom: 30px;
    color: ${playerWon ? '#8b0000' : '#8a00e6'};
    text-transform: uppercase;
    letter-spacing: 6px;
    text-shadow: 0 0 30px ${playerWon ? 'rgba(139, 0, 0, 0.8)' : 'rgba(138, 0, 230, 0.8)'};
    animation: bloodPulse 2s ease-in-out infinite alternate;
  `;
  title.textContent = playerWon ? '† VICTORY †' : '† DEFEAT †';
  
  // Message
  const message = document.createElement('p');
  message.style.cssText = `
    font-family: 'Dudu Calligraphy', cursive;
    font-size: 2em;
    margin-bottom: 50px;
    color: #666;
    text-align: center;
    max-width: 600px;
  `;
  message.textContent = playerWon 
    ? 'The witch has been vanquished. Your soul remains your own... for now.'
    : 'The witch claims another soul. Darkness falls eternal.';
  
  // Restart button
  const restartBtn = document.createElement('button');
  restartBtn.style.cssText = `
    font-family: 'Dudu Calligraphy', cursive;
    font-size: 1.5em;
    padding: 15px 50px;
    background: rgba(20, 20, 20, 0.8);
    color: #8b0000;
    border: 2px solid rgba(139, 0, 0, 0.6);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 0 20px rgba(139, 0, 0, 0.3);
  `;
  restartBtn.textContent = '† Restart †';
  restartBtn.onmouseover = () => {
    restartBtn.style.background = 'rgba(30, 0, 0, 0.9)';
    restartBtn.style.borderColor = 'rgba(139, 0, 0, 1)';
    restartBtn.style.boxShadow = '0 0 30px rgba(139, 0, 0, 0.6)';
    restartBtn.style.transform = 'scale(1.05)';
  };
  restartBtn.onmouseout = () => {
    restartBtn.style.background = 'rgba(20, 20, 20, 0.8)';
    restartBtn.style.borderColor = 'rgba(139, 0, 0, 0.6)';
    restartBtn.style.boxShadow = '0 0 20px rgba(139, 0, 0, 0.3)';
    restartBtn.style.transform = 'scale(1)';
  };
  restartBtn.onclick = () => {
    window.location.reload();
  };
  
  overlay.appendChild(title);
  overlay.appendChild(message);
  overlay.appendChild(restartBtn);
  document.body.appendChild(overlay);
  
  // Add fade in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// === GAME INITIALIZATION ===
async function initGame() {
  try {
    // Preload projectile models first
    await preloadProjectileModels();

    building = new Building({
      position: { x: -5, y: 13, z: 0 },
      scale: 10,
      world,
      scene,
      loadModel
    });

    player = new Player({
      position: { x: 0, y: 0, z: 0 + outsideOffset },
      modelPath: hero,
      maxSpeed: 4,
      moveForce: 7,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation,
      projectiles
    });

    npc1 = new FollowerNPC({
      position: { x: -5, y: 0, z: -8 + outsideOffset },
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
      position: { x: -10, y: 0, z: 100 + outsideOffset },
      modelPath: witch,
      maxSpeed: 20,
      stopDistance: 60,
      target: player,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation,
      projectiles
    });

    await Promise.all([
      player.loadPromise,
      npc1.loadPromise,
      npc2.loadPromise,
      building.loadPromise
    ]);

    console.log("All models loaded. Starting game...");
    loadingComplete = true;
    loadingScreen.style.display = 'none';
    healthUI.style.display = 'block';
    
    // Initial health UI update
    updateHealthUI();

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

  entityManager.update(delta);

  player.handleInput(keys, delta);
  player.update(delta);
  npc1.update(delta);
  npc2.update(delta);
  npc2.updateIndicator();

  // Update projectiles with collision detection
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const enemies = [npc2];
    if (projectiles[i].update(player, enemies)) {
      projectiles[i].dispose();
      projectiles.splice(i, 1);
    }
  }

  // Update health UI
  updateHealthUI();
  
  // Check for game over conditions
  checkGameOver();

  world.step();

  if (building.model) building.model.position.copy(building.rigidBody.translation());
  if (player.model) player.model.position.copy(player.rigidBody.translation());
  if (npc1.model) npc1.model.position.copy(npc1.rigidBody.translation());
  if (npc2.model) npc2.model.position.copy(npc2.rigidBody.translation());

  mixers.forEach(mixer => mixer.update(delta));

  // Camera follow
  const playerPos = player.rigidBody.translation();
  const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.entity.rotation);
  const cameraDistance = 25;
  const cameraHeight = 25;

  const desiredPosition = new THREE.Vector3(
    playerPos.x - playerForward.x * cameraDistance,
    playerPos.y + cameraHeight,
    playerPos.z - playerForward.z * cameraDistance
  );

  camera.position.lerp(desiredPosition, 0.1);
  camera.lookAt(playerPos.x, playerPos.y + 3, playerPos.z);

  renderer.render(scene, camera);
}

initGame();