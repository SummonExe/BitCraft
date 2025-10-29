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

// === LOADING SCREEN ===
const loadingScreen = document.getElementById('loadingScreen');
if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === GLOBAL STATE ===
let world, physicsReady = false;
let player;
let loadingComplete = false;
let isPaused = false;
const subtitleElement = document.getElementById('info-text');

// Initialize Rapier physics
await RAPIER.init();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x0f0f0f, 100, 800);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
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
const GAME_DURATION = 135000; // 2:15 in milliseconds (135 seconds)

// Create spawn indicator (green square)
const spawnIndicator = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, 
    emissive: 0x00ff00,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  })
);
spawnIndicator.rotation.x = -Math.PI / 2; // Lay flat on ground
spawnIndicator.position.set(2842, 9.5, -952); // Outside church spawn position
scene.add(spawnIndicator);

// Create UI elements
const timerElement = document.createElement('div');
timerElement.style.position = 'absolute';
timerElement.style.top = '20px';
timerElement.style.left = '20px';
timerElement.style.color = 'white';
timerElement.style.fontSize = '32px';
timerElement.style.fontFamily = 'Arial, sans-serif';
timerElement.style.fontWeight = 'bold';
timerElement.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
timerElement.style.zIndex = '1000';
document.body.appendChild(timerElement);

const bibleBarElement = document.createElement('div');
bibleBarElement.style.position = 'absolute';
bibleBarElement.style.top = '70px';
bibleBarElement.style.left = '20px';
bibleBarElement.style.color = '#FFD700';
bibleBarElement.style.fontSize = '20px';
bibleBarElement.style.fontFamily = 'Arial, sans-serif';
bibleBarElement.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
bibleBarElement.style.display = 'none';
bibleBarElement.style.zIndex = '1000';
bibleBarElement.innerText = '📖 BIBLE COLLECTED!';
document.body.appendChild(bibleBarElement);

// Create Pause Menu
const pauseMenu = document.createElement('div');
pauseMenu.style.position = 'absolute';
pauseMenu.style.top = '50%';
pauseMenu.style.left = '50%';
pauseMenu.style.transform = 'translate(-50%, -50%)';
pauseMenu.style.padding = '40px 60px';
pauseMenu.style.background = 'rgba(0, 0, 0, 0.95)';
pauseMenu.style.border = '3px solid #ffffff';
pauseMenu.style.borderRadius = '15px';
pauseMenu.style.color = '#fff';
pauseMenu.style.textAlign = 'center';
pauseMenu.style.zIndex = '2000';
pauseMenu.style.display = 'none';
pauseMenu.innerHTML = `
  <div style="font-size: 48px; font-weight: bold; margin-bottom: 30px;">PAUSED</div>
  <button id="resume-btn" style="
    padding: 15px 40px;
    font-size: 24px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    margin: 10px;
    width: 200px;
  ">Resume</button>
  <br>
  <button id="pause-menu-btn" style="
    padding: 15px 40px;
    font-size: 24px;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    margin: 10px;
    width: 200px;
  ">Main Menu</button>
  <div style="margin-top: 30px; font-size: 16px; color: #aaa;">Press ESC to resume</div>
`;
document.body.appendChild(pauseMenu);

// Pause menu event listeners
document.getElementById('resume-btn').addEventListener('click', () => {
  togglePause();
});

document.getElementById('pause-menu-btn').addEventListener('click', () => {
  window.location.href = '/'; // Navigate to main menu
});

// Function to toggle pause
function togglePause() {
  isPaused = !isPaused;
  pauseMenu.style.display = isPaused ? 'block' : 'none';
  
  if (isPaused) {
    console.log('Game paused');
  } else {
    console.log('Game resumed');
  }
}

// Game Over System
function showGameOver(won = false) {
  isGameOver = true;
  
  const gameOverDiv = document.createElement("div");
  gameOverDiv.style.position = "absolute";
  gameOverDiv.style.top = "50%";
  gameOverDiv.style.left = "50%";
  gameOverDiv.style.transform = "translate(-50%, -50%)";
  gameOverDiv.style.padding = "40px 60px";
  gameOverDiv.style.background = won ? "rgba(0, 139, 0, 0.95)" : "rgba(139, 0, 0, 0.95)";
  gameOverDiv.style.border = won ? "3px solid #00ff00" : "3px solid #ff0000";
  gameOverDiv.style.borderRadius = "15px";
  gameOverDiv.style.color = "#fff";
  gameOverDiv.style.fontSize = "48px";
  gameOverDiv.style.fontWeight = "bold";
  gameOverDiv.style.textAlign = "center";
  gameOverDiv.style.zIndex = "3000";
  
  if (won) {
    gameOverDiv.innerHTML = `
      <div style="margin-bottom: 20px;">🎉 YOU WIN! 🎉</div>
      <div style="font-size: 20px; margin-bottom: 10px;">Bible collected in time!</div>
      <div style="font-size: 18px; margin-bottom: 30px;">Time: ${formatTime(collectionTime - gameStartTime)}</div>
      <button id="next-stage-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #00ff00;
        color: black;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin: 10px;
      ">Next Stage ➜</button>
      <br>
      <button id="restart-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #4CAF50;
        color: white;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin: 10px;
      ">Play Again</button>
      <br>
      <button id="menu-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #ff9800;
        color: white;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin: 10px;
      ">Main Menu</button>
    `;
  } else {
    gameOverDiv.innerHTML = `
      <div style="margin-bottom: 20px;">⏰ TIME'S UP!</div>
      <div style="font-size: 20px; margin-bottom: 30px;">You ran out of time...</div>
      <button id="restart-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #ff0000;
        color: white;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin: 10px;
      ">Try Again</button>
      <br>
      <button id="menu-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #ff9800;
        color: white;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
        margin: 10px;
      ">Main Menu</button>
    `;
  }
  
  document.body.appendChild(gameOverDiv);
  
  // Event listeners for buttons
  const restartBtn = document.getElementById("restart-btn");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      location.reload();
    });
  }
  
  const menuBtn = document.getElementById("menu-btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      window.location.href = '/'; // Navigate to main menu
    });
  }
  
  const nextStageBtn = document.getElementById("next-stage-btn");
  if (nextStageBtn) {
    nextStageBtn.addEventListener("click", () => {
      window.location.href = '/src/pages/stage2/stage2.html'; // Navigate to stage 2
    });
  }
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
  
  // ESC to toggle pause
  if (e.key === 'Escape' && !isGameOver) {
    togglePause();
  }
});
window.addEventListener('keyup', (e) => { 
  if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
  if (e.key === 'Shift') keys.Shift = false;
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
  if (isPaused) {
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
      } else if (remainingTime < 60000) { // Last minute
        timerElement.style.color = '#ffaa00';
      } else {
        timerElement.style.color = 'white';
      }
    }
    
    timerElement.innerText = timeDisplay;
    
    // Update subtitle with position and instructions
    const bibleInstruction = !bibleCollected && bibleMesh 
      ? ' | Press Shift+E near Bible to collect | ESC to Pause'
      : ' | ESC to Pause';
    subtitleElement.innerText = `Player Position: X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)} | Use Arrow Keys to move${bibleInstruction}`;
  }
  
  mixers.forEach(mixer => mixer.update(delta));
  
  // Animate spawn indicator
  spawnIndicator.material.opacity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
  
  // Smooth camera follow
  if (player.rigidBody) {
    const playerPos = player.rigidBody.translation();
    const playerForward = new THREE.Vector3(0, 0, 1);
    playerForward.applyQuaternion(player.entity.rotation);
    
    const cameraDistance = 35;
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