import * as THREE from 'three';
import {
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh,
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial,
  AmbientLight, Vector3, Quaternion, Color, AnimationMixer, Box3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from '../../../public/character/undercover_cop/character_2.js';
import MiniMap from "../../MiniMap.js";

import FlashingModel from "../../../public/models/arrow.glb";
import DoorModel from "../../../public/models/door_wood.glb";
import Coin from "../../../public/models/holy_water.glb";
import NPCModel from "../../../src/assets/models/creepy_teen_girl.glb";

import Outside from "../../../public/models/theMansion/the_mansion.compressed.glb";
import Building from "../../../public/models/maze_room.glb";
import bedroom from "../../../public/models/hill_room.glb";
import kid from "../../../public/models/kid2/Idle.fbx";

import GhostSound from "../../../src/assets/sounds/ghost-screaming.mp3";
import GirlScream from "../../../src/assets/sounds/kid-screaming.mp3";

// === CACHE SETUP ===
const CACHE_NAME = 'stage2-game-cache-v1';
const ASSET_URLS = [
  FlashingModel,
  DoorModel,
  Coin,
  NPCModel,
  Outside,
  Building,
  bedroom,
  kid,
  GhostSound,
  GirlScream,
  "https://play.rosebud.ai/assets/windy_day_ambience_01.wav?gq3B"
];

// Cache all assets
async function cacheAssets() {
  if (!('caches' in window)) {
    console.warn('Cache API not supported');
    return false;
  }
  
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSET_URLS);
    console.log('All assets cached successfully');
    return true;
  } catch (error) {
    console.warn('Failed to cache assets:', error);
    return false;
  }
}

// Check if assets are cached
async function areAssetsCached() {
  if (!('caches' in window)) return false;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.length >= ASSET_URLS.length;
  } catch {
    return false;
  }
}

// === LOADING SCREEN ===
const loadingScreen = document.getElementById('loadingScreen');
if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === GLOBAL STATE ===
let clock = new Clock();
let world;
let currentScene = "mansion";
let mazeSize = null;
let isSwitching = false;
let groundCollider = null;
let loadingComplete = false;
let gamePaused = false;
let bedroomReached = false;
let bedroomReachTime = null;
const BEDROOM_WIN_DELAY = 10000; // 10 seconds

let scene, camera, renderer, character;
let activeColliders = [];
let activeBuildingRoots = [];
let flashingObjects = [];
let doorMixers = [];
let coins = [];
let npcs = [];
let kidModel = null;
let score = 0;
let scoreElement;
let miniMap = null;
let isGameOver = false;
let listener, soundLoader;

const cameraOffset = new Vector3(0, 3, -6);
const lookAtOffset = new Vector3(0, 1.5, 0);

// Pause menu state
gamePaused = false;

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
    ? `You rescued your child and now escape the mansion! Holy Water Collected: ${score}`
    : 'The creatures have claimed you. Darkness falls eternal.';
  
  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
  `;
  
  // Next Stage button (only for victory)
  if (playerWon) {
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
      window.location.href = '../../../src/pages/stage3/stage3.html';
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

async function init() {
  await RAPIER.init();

  scene = new Scene();
  camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  // physics world
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // character
  character = new Character(world, scene, { x: 1, y: 2, z: 116 });

  const loader = new GLTFLoader();
  const fbxLoader = new FBXLoader();
  
  // Setup Draco decoder for compressed models
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  loader.setDRACOLoader(dracoLoader);

  // --------------------------
  // AUDIO SETUP
  // --------------------------
  listener = new THREE.AudioListener();
  camera.add(listener);
  soundLoader = new THREE.AudioLoader();

  // Ensure audio context resumes on first user gesture
  let _audioContextResumed = false;
  function ensureAudioContext() {
    if (_audioContextResumed) return Promise.resolve();
    if (!listener || !listener.context) return Promise.resolve();
    if (listener.context.state === 'running') {
      _audioContextResumed = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const resume = () => {
        listener.context.resume().catch(() => { /* ignore */ }).finally(() => {
          _audioContextResumed = true;
          window.removeEventListener('pointerdown', resume);
          resolve();
        });
      };
      window.addEventListener('pointerdown', resume, { once: true });
      listener.context.resume().then(() => {
        _audioContextResumed = true;
        resolve();
      }).catch(() => {
        // wait for pointerdown
      });
    });
  }

  // --------------------------
  // GROUND COLLIDER
  // --------------------------
  function createGroundCollider(yPosition) {
    if (currentScene === "maze") {
      if (groundCollider) {
        world.removeCollider(groundCollider, true);
        groundCollider = null;
      }
      const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, yPosition, 0);
      const groundBody = world.createRigidBody(groundDesc);
      groundCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(125, 0.1, 125), groundBody);
    } else {
      if (groundCollider) {
        world.removeCollider(groundCollider, true);
        groundCollider = null;
      }
    }
  }

  // --------------------------
  // BUILDING LOADER
  // --------------------------
  function loadBuilding(url, positionOffset, name = "", targetScale = null) {
    return new Promise((resolve) => {
      loader.load(url, (gltf) => {
        const building = gltf.scene;
        if (name) building.name = name;
        building.position.copy(positionOffset);

        if (name === "bedroom") {
          building.position.y = 0;
          building.scale.set(0.5, 0.5, 0.5);
        } else if (name === "mansion") {
          building.position.y = 2;
          building.scale.set(3, 3, 3);
        } else {
          building.position.y = -50;
          building.scale.set(1, 1, 1);
        }
        if (targetScale) building.scale.copy(targetScale);
        
        createGroundCollider(name === "maze_room" ? -50 : 0);

        scene.add(building);
        activeBuildingRoots.push(building);
        building.updateMatrixWorld(true);

        const bbox = new Box3().setFromObject(building);
        const size = new Vector3();
        bbox.getSize(size);

        building.traverse((child) => {
          if (child.isMesh && child.geometry) {
            const meshName = child.name.toLowerCase();
            if (meshName.includes('outsideobjects') || 
                meshName.includes('glass') || 
                meshName.includes('yard_78_m_0') || 
                meshName.includes('yard_56_m_0') ||
                meshName.includes('yard_58_m_0')) {
              return;
            }
            
            try {
              const geometry = child.geometry.clone();
              geometry.applyMatrix4(child.matrixWorld);
              const posAttr = geometry.attributes.position;
              if (!posAttr) return;
              
              const vertices = new Float32Array(posAttr.array.slice(0));
              const indices = geometry.index ? new Uint32Array(geometry.index.array.slice(0)) : null;
              
              if (!indices) {
                geometry.dispose?.();
                return;
              }
              
              const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
              const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
              const rigidBody = world.createRigidBody(rigidBodyDesc);
              const collider = world.createCollider(colliderDesc, rigidBody);
              activeColliders.push(collider);
              geometry.dispose?.();
            } catch (err) {
              console.error("Failed to create collider for mesh:", child.name, err);
            }
          }
        });

        resolve(size);
      }, undefined, (err) => {
        console.error("Failed to load building:", url, err);
        resolve(new Vector3(1, 1, 1));
      });
    });
  }

  // --------------------------
  // SNAP TO GROUND
  // --------------------------
  function snapToGround(character, controller, delta) {
    if (!character.rigidBody || !controller) return;

    const currentPos = character.rigidBody.translation();
    
    const ray = new RAPIER.Ray(
      { x: currentPos.x, y: currentPos.y + 1, z: currentPos.z },
      { x: 0, y: -1, z: 0 }
    );
    const maxToi = 10.0;
    const hit = world.castRay(ray, maxToi, true);

    if (hit) {
      const groundY = (currentPos.y + 1) - hit.toi;
      const targetY = groundY + 0.1;
      
      if (Math.abs(currentPos.y - targetY) > 0.05) {
        const newY = currentPos.y + (targetY - currentPos.y) * Math.min(delta * 15, 1);
        character.rigidBody.setTranslation(
          {
            x: currentPos.x,
            y: newY,
            z: currentPos.z
          },
          true
        );
      }
    } else {
      character.rigidBody.setTranslation(
        {
          x: currentPos.x,
          y: currentPos.y - 9.81 * delta,
          z: currentPos.z
        },
        true
      );
    }
  }

  // --------------------------
  // NPC SYSTEM
  // --------------------------
  function loadNPC(url, startPosition, soundUrl = GhostSound) {
    loader.load(url, (gltf) => {
      const npc = gltf.scene;
      npc.position.copy(startPosition);
      npc.scale.set(2.5, 2.5, 2.5);
      npc.rotation.y = 0;
      
      scene.add(npc);
      activeBuildingRoots.push(npc);
      
      let mixer = null;
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new AnimationMixer(npc);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }
      
      // Load sound and attach to NPC (positional)
      const sound = new THREE.PositionalAudio(listener);
      soundLoader.load(soundUrl, (buffer) => {
        sound.setBuffer(buffer);
        sound.setRefDistance(20);
        sound.setLoop(false);
        sound.setVolume(0.7);
        
        ensureAudioContext().then(() => {
          try { sound.play(); } catch (e) { /* play may fail until user gesture */ }
        });
      }, undefined, (err) => {
        console.warn('Failed to load NPC sound:', err);
      });
      npc.add(sound);
      
      const npcData = {
        model: npc,
        mixer: mixer,
        sound: sound,
        speed: 3,
        detectionRadius: 50.0,
        active: false
      };
      
      npcs.push(npcData);
      console.log("NPC loaded at position:", startPosition);
    }, undefined, (err) => console.error("Failed to load NPC:", err));
  }

  function updateNPCs(delta, playerPos) {
    if (!playerPos) return;
    
    for (const npc of npcs) {
      if (npc.mixer) {
        npc.mixer.update(delta);
      }
      
      const dx = playerPos.x - npc.model.position.x;
      const dz = playerPos.z - npc.model.position.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      
      if (distToPlayer < npc.detectionRadius) {
        npc.active = true;
        // play sound when player enters radius
        if (npc.sound && !npc.sound.isPlaying) {
          ensureAudioContext().then(() => {
            try { npc.sound.play(); } catch (e) {}
          });
        }
      }
      
      if (npc.active && distToPlayer > 1.0) {
        let dirX = dx / distToPlayer;
        let dirZ = dz / distToPlayer;
        
        for (const otherNpc of npcs) {
          if (otherNpc === npc) continue;
          
          const npcDx = npc.model.position.x - otherNpc.model.position.x;
          const npcDz = npc.model.position.z - otherNpc.model.position.z;
          const npcDist = Math.sqrt(npcDx * npcDx + npcDz * npcDz);
          
          if (npcDist < 3.0 && npcDist > 0.01) {
            const separationForce = 1.5;
            dirX += (npcDx / npcDist) * separationForce;
            dirZ += (npcDz / npcDist) * separationForce;
          }
        }
        
        const magnitude = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (magnitude > 0.01) {
          dirX /= magnitude;
          dirZ /= magnitude;
        }
        
        npc.model.position.x += dirX * npc.speed * delta;
        npc.model.position.z += dirZ * npc.speed * delta;
        
        // Set Y position based on scene
        if (currentScene === "maze") {
          npc.model.position.y = 3;
        } else if (currentScene === "mansion") {
          npc.model.position.y = 1.2;
        }
        
        npc.model.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  function checkNPCCollisions(characterPos) {
    // Check collisions with NPCs in both mansion and maze scenes
    for (const npc of npcs) {
      const dx = characterPos.x - npc.model.position.x;
      const dy = characterPos.y - npc.model.position.y;
      const dz = characterPos.z - npc.model.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // Collision distance threshold - checking 3D distance
      if (dist < 2.5 ) {
        console.log("NPC collision detected! Distance:", dist, "Scene:", currentScene);
        return true;
      }
    }
    return false;
  }

  // --------------------------
  // GAME OVER SYSTEM
  // --------------------------
  function showGameOver(won = false) {
    isGameOver = true;
    character.canMove = () => false;
    showGameOverScreen(won);
  }

  // --------------------------
  // FLASHING MODEL
  // --------------------------
  function loadFlashingModel(url, position) {
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.position.copy(position);
      model.scale.set(1, 1, 1);
      model.rotation.y = Math.PI / 2;
      scene.add(model);
      activeBuildingRoots.push(model);

      model.traverse((child) => {
        if (child.isMesh) {
          if (!('emissive' in child.material)) child.material.emissive = new Color(0x00ff00);
          child.material.emissiveIntensity = 1;
        }
      });

      model.userData.flashTime = 0;
      flashingObjects.push(model);
    }, undefined, (err) => console.error("Failed to load flashing model:", err));
  }

  function updateFlashing(delta) {
    for (const obj of flashingObjects) {
      obj.userData.flashTime += delta * 5;
      const intensity = (Math.sin(obj.userData.flashTime) + 1) / 2 * 2;
      obj.traverse((child) => {
        if (child.isMesh) child.material.emissiveIntensity = intensity;
      });
    }
  }

  // --------------------------
  // DOORS
  // --------------------------
  function loadDoorModel(url, position, soundUrl = GirlScream) {
    loader.load(url, (gltf) => {
      const door = gltf.scene;
      door.rotation.y = Math.PI;
      door.scale.set(11, 14, 30);
      door.position.copy(position);
      scene.add(door);
      activeBuildingRoots.push(door);

      // attach positional sound to door
      const sound = new THREE.PositionalAudio(listener);
      soundLoader.load(soundUrl, (buffer) => {
        sound.setBuffer(buffer);
        sound.setRefDistance(20);
        sound.setLoop(false);
        sound.setVolume(0.7);
      }, undefined, (err) => console.warn('Failed to load door sound:', err));
      door.add(sound);

      // store sound and detection data
      door.userData.sound = sound;
      door.userData.detectionRadius = 300;
      door.userData.hasScreamed = false;

      try {
        const doorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
        const doorBody = world.createRigidBody(doorBodyDesc);
        const doorCollider = RAPIER.ColliderDesc.cuboid(1, 3, 0.2).setSensor(true);
        const col = world.createCollider(doorCollider, doorBody);
        activeColliders.push(col);
      } catch (e) {
        console.warn("Failed to create door collider:", e);
      }

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new AnimationMixer(door);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        door.userData.mixer = mixer;
        doorMixers.push(mixer);
      }
    }, undefined, (err) => console.error("Failed to load door model:", err));
  }

  function updateDoors(delta, playerPosition) {
    for (const mixer of doorMixers) mixer.update(delta);

    if (!playerPosition) return;

    for (const obj of activeBuildingRoots) {
      if (!obj || !obj.position || !obj.userData.sound) continue;

      const distance = obj.position.distanceTo(playerPosition);
      const withinRange = distance <= obj.userData.detectionRadius;

      if (withinRange && !obj.userData.hasScreamed) {
        ensureAudioContext().then(() => {
          try { obj.userData.sound.play(); } catch (e) {}
        });
        obj.userData.hasScreamed = true;
      }

      if (!withinRange && obj.userData.hasScreamed && !obj.userData.sound.isPlaying) {
        obj.userData.hasScreamed = false;
      }
    }
  }

  // --------------------------
  // MINIMAP
  // --------------------------
  function initMiniMap() {
    miniMap = new MiniMap(renderer, scene, character);
  }

  // --------------------------
  // COINS
  // --------------------------
  scoreElement = document.createElement("div");
  scoreElement.style.position = "absolute";
  scoreElement.style.top = "10px";
  scoreElement.style.left = "150px";
  scoreElement.style.color = "white";
  scoreElement.style.fontSize = "18px";
  scoreElement.style.fontWeight = "700";
  scoreElement.style.background = "rgba(0,0,0,0.45)";
  scoreElement.style.padding = "6px 8px";
  scoreElement.style.borderRadius = "6px";
  scoreElement.innerText = "Holy Water: 0";
  document.body.appendChild(scoreElement);

  function loadCoin(url, position) {
    loader.load(url, (gltf) => {
      const coin = gltf.scene.clone();
      coin.position.copy(position);
      coin.scale.set(0.005, 0.005, 0.005);
      coin.rotation.y = 0;
      coin.userData = coin.userData || {};
      coin.userData.pulseTime = Math.random() * Math.PI * 2;
      scene.add(coin);
      activeBuildingRoots.push(coin);
      coins.push(coin);

      coin.traverse((child) => {
        if (child.isMesh) {
          if (!('emissive' in child.material)) child.material.emissive = new Color(0xffff00);
          child.material.emissiveIntensity = 0.8;
        }
      });
    }, undefined, (err) => console.error("Failed to load coin:", err));
  }

  function updateCoins(delta, pos) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const coin = coins[i];
      coin.rotation.y += delta * 3.5;
      coin.userData.pulseTime += delta * 4;
      const intensity = (Math.sin(coin.userData.pulseTime) + 1) / 2 * 1.8 + 0.2;
      coin.traverse((child) => {
        if (child.isMesh) child.material.emissiveIntensity = intensity;
      });

      const dx = pos.x - coin.position.x;
      const dy = pos.y - coin.position.y;
      const dz = pos.z - coin.position.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < 2.0) {
        scene.remove(coin);
        coins.splice(i, 1);
        score += 5;
        scoreElement.innerText = "Holy Water: " + score;
      }
    }
  }

  // --------------------------
  // UNLOAD
  // --------------------------
  function unloadActiveBuilding() {
    for (const col of activeColliders) {
      try { world.removeCollider(col, true); }
      catch (e) { try { world.removeCollider(col); } catch {} }
    }
    activeColliders.length = 0;

    for (const root of activeBuildingRoots) {
      root.traverse((node) => {
        if (node.isMesh) {
          try { if (node.geometry) node.geometry.dispose?.(); } catch {}
          try {
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(m => { if (m.map) m.map.dispose?.(); m.dispose?.(); });
              } else {
                if (node.material.map) node.material.map.dispose?.();
                node.material.dispose?.();
              }
            }
          } catch {}
        }
      });
      scene.remove(root);
    }
    activeBuildingRoots.length = 0;
    flashingObjects.length = 0;
    doorMixers.length = 0;
    npcs.length = 0;
  }

  // --------------------------
  // DIALOGUE SYSTEM
  // --------------------------
  const dialogueBox = document.createElement("div");
  dialogueBox.id = "dialogue-box";
  dialogueBox.style.position = "absolute";
  dialogueBox.style.bottom = "60px";
  dialogueBox.style.left = "50%";
  dialogueBox.style.transform = "translateX(-50%)";
  dialogueBox.style.minWidth = "600px";
  dialogueBox.style.maxWidth = "80%";
  dialogueBox.style.padding = "16px 24px";
  dialogueBox.style.border = "2px solid #6c5ce7";
  dialogueBox.style.borderRadius = "12px";
  dialogueBox.style.background = "rgba(0, 0, 0, 0.85)";
  dialogueBox.style.color = "#fff";
  dialogueBox.style.fontSize = "18px";
  dialogueBox.style.display = "none";
  dialogueBox.style.zIndex = "999";
  document.body.appendChild(dialogueBox);

  const DIALOGUE = [
    { speaker: "YOU", text: "You're safe now. I found you just in time. Come on, let's get you out of here. There are entities here waiting for kill us." },
  ];

  function showDialogueSequence(lines, typingSpeed = 28, onFinish = null) {
    let index = 0;

    function typeLine(line, cb) {
      let charIndex = 0;
      dialogueBox.innerHTML = `<strong style="color:#74b9ff;">${line.speaker}</strong><br><span id="dialogue-text"></span>
      <div style="font-size:14px; color:#888; text-align:right;">Click to continue →</div>`;
      dialogueBox.style.display = "block";

      const dialogueText = document.getElementById("dialogue-text");
      dialogueText.textContent = "";

      let typingInterval = setInterval(() => {
        dialogueText.textContent += line.text.charAt(charIndex);
        charIndex++;
        if (charIndex >= line.text.length) {
          clearInterval(typingInterval);
        }
      }, typingSpeed);

      const clickHandler = () => {
        clearInterval(typingInterval);
        dialogueText.textContent = line.text;
        dialogueBox.removeEventListener("click", clickHandler);
        cb();
      };

      dialogueBox.addEventListener("click", clickHandler);
    }

    function nextDialogue() {
      if (index >= lines.length) {
        dialogueBox.style.display = "none";
        if (onFinish) onFinish();
        return;
      }
      typeLine(lines[index], () => {
        index++;
        dialogueBox.addEventListener("click", nextDialogue, { once: true });
      });
    }

    nextDialogue();
  }

  // --------------------------
  // BEDROOM OBJECTS
  // --------------------------
  function loadBedroomObjects() {
    // Load kid model if needed
    const fbxLoader = new FBXLoader();
    fbxLoader.load(kid, (fbx) => {
      kidModel = fbx;
      kidModel.position.set(5, 1, 5);
      kidModel.scale.set(0.025, 0.025, 0.025);
      scene.add(kidModel);
      activeBuildingRoots.push(kidModel);
      
      // Add scream sound to kid
      const kidSound = new THREE.PositionalAudio(listener);
      soundLoader.load(GirlScream, (buffer) => {
        kidSound.setBuffer(buffer);
        kidSound.setRefDistance(30);
        kidSound.setLoop(false);
        kidSound.setVolume(0.8);
      }, undefined, (err) => console.warn('Failed to load kid scream sound:', err));
      kidModel.add(kidSound);
      
      // Store sound and detection data
      kidModel.userData.sound = kidSound;
      kidModel.userData.detectionRadius = 25;
      kidModel.userData.hasScreamed = false;
      
      if (fbx.animations && fbx.animations.length > 0) {
        const mixer = new AnimationMixer(kidModel);
        const action = mixer.clipAction(fbx.animations[0]);
        action.play();
        doorMixers.push(mixer);
      }
    }, undefined, (err) => console.error("Failed to load kid model:", err));
  }
  
  // --------------------------
  // UPDATE KID
  // --------------------------
  function updateKid(playerPosition) {
    if (!kidModel || !playerPosition || !kidModel.userData.sound) return;
    
    const distance = kidModel.position.distanceTo(playerPosition);
    const withinRange = distance <= kidModel.userData.detectionRadius;
    
    if (withinRange && !kidModel.userData.hasScreamed) {
      ensureAudioContext().then(() => {
        try { 
          kidModel.userData.sound.play();
          console.log("Kid screaming! Distance:", distance);
        } catch (e) {
          console.warn("Failed to play kid scream:", e);
        }
      });
      kidModel.userData.hasScreamed = true;
    }
    
    if (!withinRange && kidModel.userData.hasScreamed && !kidModel.userData.sound.isPlaying) {
      kidModel.userData.hasScreamed = false;
    }
  }

  // --------------------------
  // SCENE SWITCHING
  // --------------------------
  async function switchScene(filePath, name = "") {
    console.log("Switching scene to:", name);
    isSwitching = true;
    unloadActiveBuilding();

    const targetScale = name === "bedroom" ? new Vector3(0.5, 0.5, 0.5) : new Vector3(1, 1, 1);
    const yPosition = (name === "bedroom" || name === "mansion") ? 0 : -50;
    mazeSize = await loadBuilding(filePath, new Vector3(0, yPosition, 0), name, targetScale);

    let startX = 0;
    let startY = 2;
    let startZ = 0;
    
    character.rigidBody.setTranslation({ x: startX, y: startY, z: startZ }, true);
    if (character.model) character.model.scale.set(1.8, 1.8, 1.8);
    character.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    character.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    character.update(0);
    updateCamera(0);

    if (name === "bedroom") {
      bedroomReached = true;
      bedroomReachTime = Date.now();
      
      // Load bedroom specific objects (kid model) - non-blocking
      loadBedroomObjects();
      
      // Allow character to move freely
      character.canMove = () => true;
      
      // Show dialogue without blocking game
      showDialogueSequence(DIALOGUE, 28, () => {
        console.log("Dialogue finished");
      });
    } else {
      character.canMove = () => true;
    }

    isSwitching = false;
  }

  // --------------------------
  // INITIAL LOAD
  // --------------------------
  async function loadInitialScene() {
    try {
      console.log("Starting to load mansion...");
      mazeSize = await loadBuilding(Outside, new Vector3(0, 0, 0), "mansion");
      console.log("Mansion loaded successfully");
    } catch (err) {
      console.error("Failed to load mansion:", err);
      throw err;
    }
  }

  async function loadMansionObjects() {
    const npcPositions = [
      new Vector3(-8, 2, 10),
      new Vector3(12, 2, 8),
      new Vector3(5, 2, 20),
      new Vector3(-3, 2, 15)
    ];
    
    for (const pos of npcPositions) {
      loadNPC(NPCModel, pos, GhostSound);
    }
  }

  async function loadMazeObjects() {
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, -46.07));
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, 30.00));
    loadDoorModel(DoorModel, new Vector3(-28.28, -48.51, -74.33), GirlScream);
    loadCoin(Coin, new Vector3(-35, -21, -145));
    loadCoin(Coin, new Vector3(-45, 2, -65));
    loadCoin(Coin, new Vector3(-30, 2, 25));
    loadCoin(Coin, new Vector3(24, 2, 25));

    loadNPC(NPCModel, new Vector3(-45.78, 3, -46.07), GhostSound);
    loadNPC(NPCModel, new Vector3(-45.78, 3, 30.00), GhostSound);
  }

  // --------------------------
  // GAME INITIALIZATION
  // --------------------------
  async function initGame() {
    try {
      console.log("Starting game initialization...");
      
      // Check if assets are cached
      const isCached = await areAssetsCached();
      console.log(isCached ? "Loading from cache..." : "Loading fresh assets (will cache for next time)...");
      
      await Promise.all([
        loadInitialScene(),
        loadMansionObjects()
      ]);
      
      initMiniMap();
      
      console.log("All assets loaded successfully!");
      
      // Cache assets for next time if not already cached
      if (!isCached) {
        console.log("Caching assets for faster future loads...");
        await cacheAssets();
      }
      
      loadingComplete = true;
      
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
      
    } catch (error) {
      console.error("Failed to load game assets:", error);
      if (loadingScreen) {
        loadingScreen.innerHTML = `<h2>Loading Failed</h2><p>Please refresh and try again.</p>`;
      }
    }
  }

  // --------------------------
  // MUSIC
  // --------------------------
  const bgMusic = new window.Audio("https://play.rosebud.ai/assets/windy_day_ambience_01.wav?gq3B");
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play().catch(() => {
    window.addEventListener('pointerdown', () => {
      bgMusic.play().catch(() => {});
    }, { once: true });
  });

  function updateCamera(delta) {
    if (!character.model) return;
    const rotatedOffset = cameraOffset.clone().applyAxisAngle(
      new Vector3(0, 1, 0),
      character.model.rotation.y
    );
    const desiredPos = character.model.position.clone().add(rotatedOffset);
    camera.position.lerp(desiredPos, 2.5 * delta);
    const lookTarget = character.model.position.clone().add(lookAtOffset);
    camera.lookAt(lookTarget);
  }

  function animate() {
    const delta = clock.getDelta();
    
    // Don't update game until loading is complete
    if (!loadingComplete) {
      renderer.render(scene, camera);
      return;
    }
    
    // If paused, just render and return
    if (gamePaused) {
      renderer.render(scene, camera);
      return;
    }
    
    if (!isSwitching && !isGameOver) {
      world.step();
      if (character.controller) {
        character.controller.enableSnapToGround(0.5);
        character.controller.setMaxSlopeClimbAngle(Math.PI / 4);
        character.controller.setMinSlideAngle(Math.PI / 6);
        character.controller.setStepOffset(0.5);
      }
      character.update(delta);
      snapToGround(character, character.controller, delta);
      updateFlashing(delta);
      
      if (character.model) {
        updateDoors(delta, character.model.position);
        updateNPCs(delta, character.model.position);
        
        // Update kid scream in bedroom
        if (currentScene === "bedroom") {
          updateKid(character.model.position);
        }
      }
    }
    
    updateCamera(delta);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);

    if (character.model && !isGameOver) {
      character.model.scale.set(1.5, 1.5, 1.5);
      const pos = character.model.position;

      // Check for NPC collisions FIRST - this kills the player immediately
      if (checkNPCCollisions(pos)) {
        console.log("Player killed by NPC collision!");
        showGameOver(false);
        return;
      }

      // Check for win condition in bedroom - simple 3 second timer
      if (bedroomReached && bedroomReachTime) {
        const elapsedTime = Date.now() - bedroomReachTime;
        if (elapsedTime >= BEDROOM_WIN_DELAY) {
          showGameOver(true);
          return;
        }
      }

      if (miniMap) miniMap.update(pos);
      updateCoins(delta, pos);

      if (currentScene === "mansion") {
        const dx = pos.x - (2.5);
        const dz = pos.z - (3.5);
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2) {
          currentScene = "maze";
          switchScene(Building, "maze_room").then(() => {
            loadMazeObjects();
          });
        }
      } else if (currentScene === "maze") {
        const dx = pos.x - (-25.45);
        const dz = pos.z - (-74.33);
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 10) {
          currentScene = "bedroom";
          switchScene(bedroom, "bedroom");
        }
      }
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Start game initialization
  await initGame();
}

init();