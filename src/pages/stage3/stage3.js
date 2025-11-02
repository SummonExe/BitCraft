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

import MusicSound from "../../../src/assets/sounds/horror.mp3";

import powerP from "../../../public/models/projectiles/rasengan.glb";
import powerL from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerO from "../../../public/models/projectiles/adorned_metal_sphere.glb";
import powerK from "../../../public/models/projectiles/adorned_metal_sphere.glb";
import powerI from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerJ from "../../../public/models/projectiles/exoplanet_sg10446623.glb";

import power0 from "../../../public/models/projectiles/blood_moon_grin.glb";
import power1 from "../../../public/models/projectiles/magical_orb.glb";
import power2 from "../../../public/models/projectiles/blood_moon_grin.glb";
import power3 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power4 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power5 from "../../../public/models/projectiles/graveyard_fog_eyeball_-_blender_file.glb";

// === LOADING SCREEN & UI ===
const loadingScreen = document.getElementById('loadingScreen');
const healthUI = document.getElementById('healthUI');
const powerUI = document.getElementById('powerUI');
const playerHealthFill = document.getElementById('playerHealthFill');
const playerHealthText = document.getElementById('playerHealthText');
const witchHealthFill = document.getElementById('witchHealthFill');
const witchHealthText = document.getElementById('witchHealthText');

if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === BACKGROUND MUSIC ===
const bgMusic = new Audio(MusicSound);
bgMusic.loop = true;
bgMusic.volume = 0.3; // Adjusted for better gameplay experience
bgMusic.preload = 'auto';

// Function to start music (handles autoplay restrictions)
function startBackgroundMusic() {
  bgMusic.play().catch(error => {
    console.log('Autoplay prevented, waiting for user interaction:', error);
    // Fallback: play on first user interaction
    const playOnInteraction = () => {
      bgMusic.play().catch(() => {});
      document.removeEventListener('keydown', playOnInteraction);
      document.removeEventListener('click', playOnInteraction);
    };
    document.addEventListener('keydown', playOnInteraction, { once: true });
    document.addEventListener('click', playOnInteraction, { once: true });
  });
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

// Create power UI configuration
const powerConfigs = [
  { key: 'p', name: 'Triple Shot', color: '#ff6b6b', modelPath: powerP },
  { key: 'l', name: 'Circle Burst', color: '#4ecdc4', modelPath: powerL },
  { key: 'o', name: 'Single Shot', color: '#95e1d3', modelPath: powerO },
  { key: 'k', name: 'Fast Shot', color: '#f38181', modelPath: powerK },
  { key: 'i', name: 'Spread Shot', color: '#aa96da', modelPath: powerI },
  { key: 'j', name: 'Magic Orb', color: '#fcbad3', modelPath: powerJ }
];

// Store mini renderers and scenes for each power
const powerMiniScenes = new Map();

// Initialize Power UI
async function initializePowerUI() {
  if (!powerUI) return;
  
  for (const config of powerConfigs) {
    const slot = document.createElement('div');
    slot.className = 'power-slot';
    slot.id = `power-slot-${config.key}`;
    slot.dataset.key = config.key;
    
    // Create mini canvas for 3D model preview
    const miniCanvas = document.createElement('canvas');
    miniCanvas.className = 'power-model-preview';
    miniCanvas.width = 100;  // Static resolution
    miniCanvas.height = 100;
    
    // Create mini scene for this power
    const miniScene = new THREE.Scene();
    miniScene.background = new THREE.Color(0x0a0a0a);
    
    const miniCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    miniCamera.position.set(0, 0, 3);
    
    const miniRenderer = new THREE.WebGLRenderer({ 
      canvas: miniCanvas, 
      antialias: true,
      alpha: true 
    });
    miniRenderer.setSize(100, 100);
    
    // Lighting for mini scene
    const ambLight = new THREE.AmbientLight(0xffffff, 0.8);
    miniScene.add(ambLight);
    
    const spotLight = new THREE.SpotLight(config.color, 1.5);
    spotLight.position.set(2, 2, 2);
    miniScene.add(spotLight);
    
    // Load and add model to mini scene
    try {
      if (projectileModelCache.has(config.modelPath)) {
        const cachedModel = projectileModelCache.get(config.modelPath);
        const modelClone = cachedModel.clone(true);
        
        // Auto-scale and center model
        const box = new THREE.Box3().setFromObject(modelClone);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.8 / maxDim;
        modelClone.scale.multiplyScalar(scale);
        
        // Center the model
        const center = box.getCenter(new THREE.Vector3());
        modelClone.position.sub(center.multiplyScalar(scale));
        
        miniScene.add(modelClone);
        
        // Render ONCE - no animation
        miniRenderer.render(miniScene, miniCamera);
        
        // Dispose of the mini renderer to free memory
        miniRenderer.dispose();
      }
    } catch (error) {
      console.warn(`Failed to load model for power ${config.key}:`, error);
    }
    
    slot.appendChild(miniCanvas);
    
    // Keybind display
    const keybind = document.createElement('div');
    keybind.className = 'power-keybind';
    keybind.textContent = config.key.toUpperCase();
    keybind.style.color = config.color;
    keybind.style.borderColor = config.color;
    keybind.style.textShadow = `0 0 5px ${config.color}`;
    slot.appendChild(keybind);
    
    // Power name
    const name = document.createElement('div');
    name.className = 'power-name';
    name.textContent = config.name;
    name.dataset.color = config.color;
    slot.appendChild(name);
    
    // Cooldown overlay
    const cooldownOverlay = document.createElement('div');
    cooldownOverlay.className = 'power-cooldown-overlay';
    cooldownOverlay.style.height = '0%';
    slot.appendChild(cooldownOverlay);
    
    // Cooldown text
    const cooldownText = document.createElement('div');
    cooldownText.className = 'power-cooldown-text';
    cooldownText.style.display = 'none';
    slot.appendChild(cooldownText);
    
    // Ready pulse
    const readyPulse = document.createElement('div');
    readyPulse.className = 'power-ready-pulse';
    readyPulse.style.background = `radial-gradient(circle at center, ${config.color}10, transparent)`;
    slot.appendChild(readyPulse);
    
    // Apply color styling
    slot.style.borderColor = config.color;
    slot.style.boxShadow = `0 0 20px ${config.color}40, inset 0 0 20px rgba(0, 0, 0, 0.6)`;
    
    powerUI.appendChild(slot);
  }
  // NO MORE animatePowerModels() call here!
}



// Update Power UI based on cooldowns
function updatePowerUI() {
  if (!player || !powerUI) return;
  
  powerConfigs.forEach(config => {
    const slot = document.getElementById(`power-slot-${config.key}`);
    if (!slot) return;
    
    const cooldown = player.attackCooldowns[config.key];
    const cooldownOverlay = slot.querySelector('.power-cooldown-overlay');
    const cooldownText = slot.querySelector('.power-cooldown-text');
    const powerName = slot.querySelector('.power-name');
    
    if (cooldown.remaining > 0) {
      // Power on cooldown
      slot.classList.remove('ready');
      const percent = (cooldown.remaining / cooldown.duration) * 100;
      cooldownOverlay.style.height = `${percent}%`;
      cooldownText.style.display = 'block';
      cooldownText.textContent = `${cooldown.remaining.toFixed(1)}s`;
      powerName.style.color = '#666';
      powerName.style.textShadow = 'none';
      slot.style.borderColor = 'rgba(80, 80, 80, 0.6)';
      slot.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.8), inset 0 0 20px rgba(0, 0, 0, 0.6)';
    } else {
      // Power ready
      slot.classList.add('ready');
      cooldownOverlay.style.height = '0%';
      cooldownText.style.display = 'none';
      powerName.style.color = config.color;
      powerName.style.textShadow = `0 0 8px ${config.color}80`;
      slot.style.borderColor = config.color;
      slot.style.boxShadow = `0 0 20px ${config.color}40, inset 0 0 20px rgba(0, 0, 0, 0.6)`;
    }
  });
}


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
  w: false,
  a: false,
  s: false,
  d: false,
  Shift: false,
  i: false,
  j: false,
  k: false,
  o: false,
  p: false,
  l: false,
  Escape: false,
  c: false  // Add C key for control toggle
};
// Pause menu state
let gamePaused = false;
let lastDeltaTime = 0;

// Pause menu elements
const pauseMenu = document.getElementById('pauseMenu');
const controlsScreen = document.getElementById('controlsScreen');
const objectiveScreen = document.getElementById('objectiveScreen');
const restartStageBtn = document.getElementById('restartStage');
const showControlsBtn = document.getElementById('showControls');
const showObjectiveBtn = document.getElementById('showObjective');
const closeBtns = document.querySelectorAll('.close-btn');

// Toggle pause menu
function togglePauseMenu() {
  if (gameOver || !loadingComplete) return; // Don't allow pausing when game over or loading
  
  gamePaused = !gamePaused;
  
  if (gamePaused) {
    if (pauseMenu) pauseMenu.style.display = 'flex';
    console.log("Game Paused");
  } else {
    if (pauseMenu) pauseMenu.style.display = 'none';
    if (controlsScreen) controlsScreen.style.display = 'none';
    if (objectiveScreen) objectiveScreen.style.display = 'none';
    console.log("Game Resumed");
  }
}

// Add this function after the togglePauseMenu function
function toggleControlMode() {
  if (!player || !loadingComplete || gameOver) return;
  
  const newMode = player.toggleControlMode();
  
  // Show notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 20, 0.95);
    color: #8b0000;
    font-family: 'DK Okiku', sans-serif;
    font-size: 2em;
    padding: 30px 60px;
    border: 3px solid rgba(139, 0, 0, 0.7);
    border-radius: 5px;
    box-shadow: 0 0 50px rgba(139, 0, 0, 0.4);
    text-shadow: 0 0 10px rgba(139, 0, 0, 0.8);
    z-index: 9998;
    animation: fadeInOut 2s ease-in-out;
  `;
  notification.textContent = newMode === 'keyboard' 
    ? '☠ KEYBOARD MODE ☠' 
    : '☠ ORBIT MODE ☠';
  
  document.body.appendChild(notification);
  
  // Add animation style if not already present
  if (!document.getElementById('controlToggleStyle')) {
    const style = document.createElement('style');
    style.id = 'controlToggleStyle';
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }
  
  setTimeout(() => {
    notification.remove();
  }, 2000);
}

// Update the keydown event listener
window.addEventListener('keydown', (e) => {
  let key = e.key;
  
  // Convert alphabetic keys to lowercase
  if (/^[a-zA-Z]$/.test(key)) {
    key = key.toLowerCase();
  }

  if (keys.hasOwnProperty(key)) {
    keys[key] = true;
  }
  
  // Escape key to toggle pause
  if (key === 'Escape' || key === 'Esc') {
    e.preventDefault();
    if (loadingComplete && !gameOver) {
      togglePauseMenu();
    }
  }
  
  // C key to toggle control mode
  if (key === 'c') {
    e.preventDefault();
    if (loadingComplete && !gameOver && !gamePaused) {
      toggleControlMode();
    }
  }
});

// Restart stage
if (restartStageBtn) {
  restartStageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.reload();
  });
}

// Show controls
if (showControlsBtn) {
  showControlsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (controlsScreen) controlsScreen.style.display = 'flex';
  });
}

// Show objective
if (showObjectiveBtn) {
  showObjectiveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (objectiveScreen) objectiveScreen.style.display = 'flex';
  });
}

// Close buttons
if (closeBtns) {
  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if(loadingComplete){
        if (controlsScreen) controlsScreen.style.display = 'none';
        if (objectiveScreen) objectiveScreen.style.display = 'none';
      }else{
        if (controlsScreen) controlsScreen.style.display = 'none';
        if (objectiveScreen) objectiveScreen.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'flex';
      }
    });
  });
}

// Close modals when clicking outside
if (controlsScreen) {
  controlsScreen.addEventListener('click', (e) => {
    if (e.target === controlsScreen) {
      if(loadingComplete){
        if (controlsScreen) controlsScreen.style.display = 'none';
      }else{
        if (controlsScreen) controlsScreen.style.display = 'none';
        if (objectiveScreen) objectiveScreen.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'flex';
      };
    }
    
  });
}

if (objectiveScreen) {
  objectiveScreen.addEventListener('click', (e) => {
    if (e.target === objectiveScreen) {
      if(loadingComplete){
        if (objectiveScreen) objectiveScreen.style.display = 'none';
      }else{
        if (controlsScreen) controlsScreen.style.display = 'none';
        if (objectiveScreen) objectiveScreen.style.display = 'none';
        if (loadingScreen) loadingScreen.style.display = 'flex';
      }
    }
  });
}

window.addEventListener('keyup', (e) => {
  let key = e.key;
  
  // Convert alphabetic keys to lowercase
  if (/^[a-zA-Z]$/.test(key)) {
    key = key.toLowerCase();
  }

  if (keys.hasOwnProperty(key)) {
    keys[key] = false;
  }
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
    ? 'The witch has been vanquished. Your child remains your alive... for now.'
    : 'The witch claims another soul. Darkness falls eternal.';
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
  `;
  
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
  
  // Main Menu button
  const menuBtn = document.createElement('button');
  menuBtn.style.cssText = `
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
  menuBtn.textContent = '† Main Menu †';
  menuBtn.onmouseover = () => {
    menuBtn.style.background = 'rgba(30, 0, 0, 0.9)';
    menuBtn.style.borderColor = 'rgba(139, 0, 0, 1)';
    menuBtn.style.boxShadow = '0 0 30px rgba(139, 0, 0, 0.6)';
    menuBtn.style.transform = 'scale(1.05)';
  };
  menuBtn.onmouseout = () => {
    menuBtn.style.background = 'rgba(20, 20, 20, 0.8)';
    menuBtn.style.borderColor = 'rgba(139, 0, 0, 0.6)';
    menuBtn.style.boxShadow = '0 0 20px rgba(139, 0, 0, 0.3)';
    menuBtn.style.transform = 'scale(1)';
  };
  menuBtn.onclick = () => {
    window.location.href = '../../../index.html';
  };
  
  buttonContainer.appendChild(restartBtn);
  buttonContainer.appendChild(menuBtn);
  
  overlay.appendChild(title);
  overlay.appendChild(message);
  overlay.appendChild(buttonContainer);
  document.body.appendChild(overlay);
  
  // Add fade in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes bloodPulse {
      0% { text-shadow: 0 0 10px rgba(139, 0, 0, 0.5); }
      100% { text-shadow: 0 0 25px rgba(139, 0, 0, 0.9); }
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
          projectiles,
          camera: camera  // Add camera reference
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
    // loadingScreen.style.display = 'none';
    // healthUI.style.display = 'block';
    
    // Initial health UI update
    updateHealthUI();

    // animate();

  } catch (error) {
    console.error("Failed to load assets:", error);
    loadingScreen.innerHTML = `<h2>Loading Failed</h2><p>Please refresh and try again.</p>`;
  }
}

// === ANIMATION LOOP ===
function animate() {
  requestAnimationFrame(animate);

  if (!physicsReady || !loadingComplete || gamePaused) return;

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
  
  // Update power UI
    updatePowerUI();
  
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

// ----- HELPER -------------------------------------------------
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
// ------------------------------------------------------------------

// === START GAME – OBJECTIVE IS PART OF LOADING ==================
(async () => {
  try {
    const objectiveScreen = document.getElementById('objectiveScreen');
    const loadingScreen   = document.getElementById('loadingScreen');
    const healthUI        = document.getElementById('healthUI');

    // --------------------------------------------------------------
    // 1. Hide the default loading screen (it is visible in HTML)
    // --------------------------------------------------------------
    if (loadingScreen) loadingScreen.style.display = 'none';

    // --------------------------------------------------------------
    // 2. Show Objective – this is the first loading phase
    // --------------------------------------------------------------
    if (objectiveScreen) objectiveScreen.style.display = 'flex';

    // --------------------------------------------------------------
    // 3. Kick off asset loading **in parallel**
    // --------------------------------------------------------------
    const loadingPromise = initGame();   // <-- your existing initGame()

    // --------------------------------------------------------------
    // 4. Wait **exactly** 30 seconds for the objective phase
    // --------------------------------------------------------------
    await wait(10_000);

    // --------------------------------------------------------------
    // 5. Objective phase finished – hide it
    // --------------------------------------------------------------
    if (objectiveScreen) objectiveScreen.style.display = 'none';

    // --------------------------------------------------------------
    // 6. If assets are not ready yet → show the real loading screen
    // --------------------------------------------------------------
    if (!loadingComplete) {
      if (loadingScreen) loadingScreen.style.display = 'flex';
      await loadingPromise;          // wait for the rest
    }

    // --------------------------------------------------------------
    // 7. Everything is ready – hide loading UI, show game UI,
    //     and finally start the render loop
    // --------------------------------------------------------------
    if (loadingScreen) loadingScreen.style.display = 'none';
    if (healthUI) healthUI.style.display = 'block';
    if (powerUI) {
      powerUI.style.display = 'block';
      await initializePowerUI();
    }
    
    startBackgroundMusic();
    animate();   // <-- ONLY HERE the game actually starts
    
  } catch (err) {
    console.error('Game init failed:', err);
    const ls = document.getElementById('loadingScreen');
    if (ls) {
      ls.style.display = 'flex';
      ls.innerHTML = `<h2>Loading Failed</h2><p>Please refresh.</p>`;
    }
  }
})();