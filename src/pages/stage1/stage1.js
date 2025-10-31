import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Player } from './Player.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import hero from "../../../public/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import soloModel from "../../../public/models/solo.glb";
import finalChurch from "../../../public/models/final_church/final_church.glb";
import Bible from "../../../public/models/bible/bible.glb";

import MusicSound from "../../../src/assets/sounds/horror.mp3";

// === LOADING SCREEN ===
const loadingScreen = document.getElementById('loadingScreen');
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
let player;
let loadingComplete = false;
let isPaused = false;
// Pause menu state
let gamePaused = false;

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
  if (isGameOver || !loadingComplete) return; // Don't allow pausing when game over or loading
  
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

// Event listeners for pause menu
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && loadingComplete && !isGameOver) {
    e.preventDefault();
    togglePauseMenu();
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
      if (controlsScreen) controlsScreen.style.display = 'none';
      if (objectiveScreen) objectiveScreen.style.display = 'none';
    });
  });
}

// Close modals when clicking outside
if (controlsScreen) {
  controlsScreen.addEventListener('click', (e) => {
    if (e.target === controlsScreen) {
      controlsScreen.style.display = 'none';
    }
  });
}

if (objectiveScreen) {
  objectiveScreen.addEventListener('click', (e) => {
    if (e.target === objectiveScreen) {
      objectiveScreen.style.display = 'none';
    }
  });
}

const subtitleElement = document.getElementById('info-text');

// Initialize Rapier physics
await RAPIER.init();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x0f0f0f, 100, 800);

const camera = new THREE.PerspectiveCamera(110, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 20);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(50, 50, 25);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Setup Rapier physics world
function setupPhysics() {
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  world = new RAPIER.World(gravity);
  
  const groundSize = 50000;
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(groundSize , 0.1, groundSize )
    .setTranslation(0, 8, 0);
  world.createCollider(groundColliderDesc);
  
  physicsReady = true;
  console.log('Physics world initialized with gravity');
}
setupPhysics();

// Yuka Entity Manager
const entityManager = new YUKA.EntityManager();
const time = new YUKA.Time();

// Animation mixer for models
const mixers = [];

// Projectile array
const projectiles = [];

// Bible collection state
let bibleMesh = null;
let bibleCollected = false;
let gameStartTime = null;
let collectionTime = null;

// Game state
let isGameOver = false;
const GAME_DURATION = 130000; // 2:15 in milliseconds (135 seconds)

// Create spawn indicator (green square)
const spawnIndicator = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, 
    emissive: 0x00ff00,
    emissiveIntensity: 3.5,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  })
);
spawnIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
spawnIndicator.position.set(2842, 9.5, -952); // Outside church spawn position
scene.add(spawnIndicator);

// Create UI elements - Updated to match theme
const timerElement = document.createElement('div');
timerElement.style.cssText = `
  position: absolute;
  top: 20px;
  left: 20px;
  color: #8b0000;
  font-size: 2em;
  font-family: 'DK Okiku', sans-serif;
  text-shadow: 0 0 10px rgba(139, 0, 0, 0.8);
  background: rgba(10, 10, 10, 0.7);
  padding: 10px 20px;
  border-radius: 5px;
  border: 2px solid rgba(139, 0, 0, 0.4);
  z-index: 1000;
`;
document.body.appendChild(timerElement);

const bibleBarElement = document.createElement('div');
bibleBarElement.style.cssText = `
  position: absolute;
  top: 80px;
  left: 20px;
  color: #FFD700;
  font-size: 1.5em;
  font-family: 'Dudu Calligraphy', cursive;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  background: rgba(10, 10, 10, 0.7);
  padding: 8px 16px;
  border-radius: 5px;
  border: 2px solid rgba(255, 215, 0, 0.4);
  display: none;
  z-index: 1000;
`;
bibleBarElement.innerHTML = '† HOLY BIBLE COLLECTED †';
document.body.appendChild(bibleBarElement);


// Game Over System - Updated to match horror theme
function showGameOver(won = false) {
  isGameOver = true;
  bgMusic.pause(); // Stop music when game ends
  
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
    color: ${won ? '#8b0000' : '#8a00e6'};
    text-transform: uppercase;
    letter-spacing: 6px;
    text-shadow: 0 0 30px ${won ? 'rgba(139, 0, 0, 0.8)' : 'rgba(138, 0, 230, 0.8)'};
    animation: bloodPulse 2s ease-in-out infinite alternate;
  `;
  title.textContent = won ? '† VICTORY †' : '† DEFEAT †';
  
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
  
  if (won) {
    const collectionTimeFormatted = formatTime(collectionTime - gameStartTime);
    message.textContent = `You found the sacred Bible in ${collectionTimeFormatted}! The holy text will protect you in the battles ahead.`;
  } else {
    message.textContent = 'The darkness has consumed you. Time has run out and the evil forces prevail.';
  }
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
  `;
  
  // Next Stage button (only for victory)
  if (won) {
    const nextStageBtn = document.createElement('button');
    nextStageBtn.style.cssText = `
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
    nextStageBtn.textContent = '† Next Stage †';
    nextStageBtn.onmouseover = () => {
      nextStageBtn.style.background = 'rgba(30, 0, 0, 0.9)';
      nextStageBtn.style.borderColor = 'rgba(139, 0, 0, 1)';
      nextStageBtn.style.boxShadow = '0 0 30px rgba(139, 0, 0, 0.6)';
      nextStageBtn.style.transform = 'scale(1.05)';
    };
    nextStageBtn.onmouseout = () => {
      nextStageBtn.style.background = 'rgba(20, 20, 20, 0.8)';
      nextStageBtn.style.borderColor = 'rgba(139, 0, 0, 0.6)';
      nextStageBtn.style.boxShadow = '0 0 20px rgba(139, 0, 0, 0.3)';
      nextStageBtn.style.transform = 'scale(1)';
    };
    nextStageBtn.onclick = () => {
      window.location.href =  "../../../src/pages/stage2/stage2.html";
    };
    buttonContainer.appendChild(nextStageBtn);
  }
  
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

// Helper function to create physics colliders from mesh
function createMeshCollider(child, world) {
  if (!child.isMesh || !child.geometry) return;
  
  try {
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    
    const positionAttribute = geometry.attributes.position;
    if (!positionAttribute) {
      console.warn('No position attribute for mesh:', child.name);
      geometry.dispose();
      return;
    }
    
    const vertices = new Float32Array(positionAttribute.array.slice(0));
    const indices = geometry.index 
      ? new Uint32Array(geometry.index.array.slice(0)) 
      : new Uint32Array([...Array(positionAttribute.count).keys()]);
    
    if (!indices || indices.length === 0) {
      console.warn('No indices for mesh:', child.name);
      geometry.dispose();
      return;
    }
    
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    colliderDesc.setRestitution(0.0);
    colliderDesc.setFriction(1.0);
    
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const rigidBody = world.createRigidBody(rigidBodyDesc);
    world.createCollider(colliderDesc, rigidBody);
    
    console.log('Created collider for:', child.name, 'vertices:', vertices.length / 3, 'triangles:', indices.length / 3);
    geometry.dispose();
  } catch (e) {
    console.warn('Could not create collider for mesh:', child.name, e);
  }
}

// Function to load FBX model
async function loadModel(path, scale = 1, rotation = new THREE.Euler(0, Math.PI, 0), position = new THREE.Vector3(0, 0, 0)) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(path, (object) => {
      const scaleFactor = 2;
      const finalScale = new THREE.Vector3(scale * scaleFactor, scale * scaleFactor, scale * scaleFactor);
      
      object.scale.copy(finalScale);
      object.rotation.copy(rotation);
      object.position.copy(position);
      
      object.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = false;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      scene.add(object);
      resolve(object);
    }, undefined, reject);
  });
}

// Function to load animation only
async function loadAnimation(path) {
  return new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(path, (object) => {
      const clips = object.animations;
      if (clips.length > 0) resolve(clips[0]);
      else reject(new Error('No animations found in file'));
    }, undefined, reject);
  });
}

// Load the Solo model as the ground
async function loadSoloModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      soloModel,
      (gltf) => {
        const soloScene = gltf.scene || gltf.scenes?.[0];
        if (!soloScene) {
          reject(new Error('GLTF loaded but contains no scene.'));
          return;
        }
        
        soloScene.scale.set(10, 10, 10);
        soloScene.position.set(0, 0, 0);
        soloScene.updateMatrixWorld(true);
        
        soloScene.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Create physics collider
            createMeshCollider(child, world);
            
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                mat.needsUpdate = true;
                if (mat.map) {
                  mat.map.needsUpdate = true;
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
              });
            }
          }
        });
        
        scene.add(soloScene);
        console.log('Solo model added to scene with physics colliders');
        resolve(soloScene);
      },
      (progress) => console.log('Loading solo model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
      reject
    );
  });
}

// Load the Church model with interior physics
async function loadChurchModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      finalChurch,
      (gltf) => {
        const church = gltf.scene || gltf.scenes?.[0];
        if (!church) {
          reject(new Error('Church GLTF loaded but contains no scene.'));
          return;
        }
        
        church.scale.set(45, 45, 45);
        church.position.set(3004, 9.8, -1232.7);
        church.rotation.y = -0.5;
        church.updateMatrixWorld(true);
        
        church.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Create physics collider
            createMeshCollider(child, world);
            
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                mat.needsUpdate = true;
                if (mat.map) {
                  mat.map.needsUpdate = true;
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
              });
            }
          }
        });
        
        scene.add(church);
        console.log('Church model added to scene with full interior physics colliders');
        resolve(church);
      },
      (progress) => console.log('Loading church model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
      reject
    );
  });
}

// Load the Bible model
async function loadBibleModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      Bible,
      (gltf) => {
        const bible = gltf.scene || gltf.scenes?.[0];
        if (!bible) {
          reject(new Error('Bible GLTF loaded but contains no scene.'));
          return;
        }
        
        bibleMesh = bible;
        bible.scale.set(10, 10, 10);
        bible.position.set(3002, 25, -1250);
        bible.updateMatrixWorld(true);
        
        // Add a golden glow to the bible
        bible.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(mat => {
                mat.emissive = new THREE.Color(0xFFD700);
                mat.emissiveIntensity = 0.1;
              });
            }
          }
        });
        
        // Add a point light above the bible for dramatic effect
        const bibleLight = new THREE.PointLight(0xFFD700, 1, 20);
        bibleLight.position.set(3002, 13, -1250);
        scene.add(bibleLight);
        
        scene.add(bible);
        console.log('Bible added to scene at position:', bible.position);
        resolve(bible);
      },
      (progress) => console.log('Loading bible model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
      reject
    );
  });
}

// Input handling
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, p: false, Shift: false, e: false };
window.addEventListener('keydown', (e) => { 
  if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
  if (e.key === 'Shift') keys.Shift = true;
  // Handle both 'e' and 'E' for interaction
  if (e.key === 'e' || e.key === 'E') keys.e = true;
  
});
window.addEventListener('keyup', (e) => { 
  if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
  if (e.key === 'Shift') keys.Shift = false;
  // Handle both 'e' and 'E' for interaction
  if (e.key === 'e' || e.key === 'E') keys.e = false;
});

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Function to check bible collection
function checkBibleCollection() {
  if (bibleCollected || !bibleMesh || !player.rigidBody) return;
  
  const playerPos = player.rigidBody.translation();
  const biblePos = bibleMesh.position;
  
  const dx = playerPos.x - biblePos.x;
  const dy = playerPos.y - biblePos.y;
  const dz = playerPos.z - biblePos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Check if player is close enough and pressing Shift+E
  if (distance < 30 && keys.Shift && keys.e) {
    bibleCollected = true;
    collectionTime = Date.now();
    
    // Remove bible from scene
    scene.remove(bibleMesh);
    
    // Show collection UI
    bibleBarElement.style.display = 'block';
    
    // Show win screen
    showGameOver(true);
    
    console.log('Bible collected! Time:', ((collectionTime - gameStartTime) / 1000).toFixed(2), 'seconds');
  }
}

// Format time as MM:SS
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// === GAME INITIALIZATION ===
async function initGame() {
  try {
    console.log("Starting to load all assets...");

    // Create player
    player = new Player({
      position: { x: 1022, y: 15, z: -280 },
      modelPath: hero,
      maxSpeed: 15,
      moveForce: 30,
      world,
      scene,
      mixers,
      entityManager,
      loadModel,
      loadAnimation,
      projectiles
    });

    // Wait for ALL models to finish loading
    await Promise.all([
      player.loadPromise,
      loadSoloModel(),
      loadChurchModel(),
      loadBibleModel()
    ]);

    console.log("All models loaded. Starting game...");
    loadingComplete = true;
    
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }

    // Start background music
    startBackgroundMusic();

    // Start animation loop
    animate();

  } catch (error) {
    console.error("Failed to load assets:", error);
    if (loadingScreen) {
      loadingScreen.innerHTML = `<h2>Loading Failed</h2><p>Please refresh and try again.</p>`;
    }
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  if (!physicsReady || !loadingComplete) return;
  
  // If paused, just render and return
  if (gamePaused) {
    renderer.render(scene, camera);
    return;
  }
  
  // Start timer on first frame
  if (!gameStartTime) {
    gameStartTime = Date.now();
  }
  
  // Check if time ran out
  if (!isGameOver && !bibleCollected) {
    const elapsedTime = Date.now() - gameStartTime;
    if (elapsedTime >= GAME_DURATION) {
      showGameOver(false);
    }
  }
  
  // Stop updating game if game over
  if (isGameOver) {
    renderer.render(scene, camera);
    return;
  }
  
  const delta = time.update().getDelta();
  entityManager.update(delta);
  player.handleInput(keys, delta);
  player.update(delta);
  
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].update()) {
      projectiles[i].dispose();
      projectiles.splice(i, 1);
    }
  }
  
  world.step();
  
  if (player.model && player.rigidBody) player.model.position.copy(player.rigidBody.translation());

  // Update UI
  if (player.rigidBody) {
    const pos = player.rigidBody.translation();
    
    // Check for bible collection
    checkBibleCollection();
    
    // Update timer (countdown)
    const elapsedTime = Date.now() - gameStartTime;
    const remainingTime = Math.max(0, GAME_DURATION - elapsedTime);
    const timeDisplay = bibleCollected 
      ? `Time to collect: ${formatTime(collectionTime - gameStartTime)}`
      : `Time Remaining: ${formatTime(remainingTime)}`;
    
    // Change color when time is running low
    if (!bibleCollected) {
      if (remainingTime < 30000) { // Last 30 seconds
        timerElement.style.color = '#ff0000';
        timerElement.style.borderColor = 'rgba(255, 0, 0, 0.6)';
        timerElement.style.textShadow = '0 0 15px rgba(255, 0, 0, 0.8)';
      } else if (remainingTime < 60000) { // Last minute
        timerElement.style.color = '#ffaa00';
        timerElement.style.borderColor = 'rgba(255, 170, 0, 0.6)';
        timerElement.style.textShadow = '0 0 15px rgba(255, 170, 0, 0.8)';
      } else {
        timerElement.style.color = '#8b0000';
        timerElement.style.borderColor = 'rgba(139, 0, 0, 0.4)';
        timerElement.style.textShadow = '0 0 10px rgba(139, 0, 0, 0.8)';
      }
    }
    
    timerElement.innerText = timeDisplay;
    
    // Update subtitle with instructions only (no coordinates)
    const bibleInstruction = !bibleCollected && bibleMesh 
      ? 'Press Shift+E near Bible to collect | ESC to Pause'
      : 'ESC to Pause';
    subtitleElement.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      color: #8b0000;
      font-family: 'Dudu Calligraphy', cursive;
      font-size: 1.2em;
      text-shadow: 0 0 10px rgba(139, 0, 0, 0.5);
      background: rgba(10, 10, 10, 0.7);
      padding: 8px 12px;
      border-radius: 5px;
      z-index: 1000;
    `;
    subtitleElement.innerText = bibleInstruction;

  }
  
  mixers.forEach(mixer => mixer.update(delta));
  
  // Animate spawn indicator
  spawnIndicator.material.opacity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
  
  // Smooth camera follow
  if (player.rigidBody) {
    const playerPos = player.rigidBody.translation();
    const playerForward = new THREE.Vector3(0, 0, 1);
    playerForward.applyQuaternion(player.entity.rotation);
    
    const cameraDistance = 40;
    const cameraHeight = 20;
    
    const desiredPosition = new THREE.Vector3(
      playerPos.x - playerForward.x * cameraDistance,
      playerPos.y + cameraHeight,
      playerPos.z - playerForward.z * cameraDistance
    );
    camera.position.lerp(desiredPosition, 0.1);
    camera.lookAt(new THREE.Vector3(playerPos.x, playerPos.y + 3, playerPos.z));
  }

  // Teleport when close to church entrance
  if (player.rigidBody) {
    const pos = player.rigidBody.translation();
    const dx = pos.x - 2852;
    const dz = pos.z - (-952);
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 20) {
      player.rigidBody.setTranslation({ x: 2927, y: 9.0, z: -1067 }, true);
      if (player.model) player.model.position.set(2927, 9.0, -1067);
      console.log("Player teleported to church interior area");
    }
  }
  
  renderer.render(scene, camera);
}

// === START ===
initGame();