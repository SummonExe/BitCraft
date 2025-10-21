import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Player } from '../stage3/Player.js';
import { FollowerNPC } from '../stage3/FollowerNPC.js';
import { ChaserNPC } from '../stage3/ChaserNPC.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import hero from "../../../src/assets/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import kid from "../../../src/assets/models/kid2/Idle.fbx";
import witch from "../../../src/assets/models/witch/witch_Idle.fbx";

// Initialize Rapier physics
let world, physicsReady = false;
const subtitleElement = document.getElementById('info-text');
await RAPIER.init();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
//scene.fog = new THREE.Fog(0x87ceeb, 100, 200);

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
  //brownish
  color: 0xd8cbc4,
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

//load src\assets\scene\church\psx_abandoned_church\scene.gltf
const loader = new GLTFLoader();
loader.load(
  "/models/final_church.glb",
  (gltf) => {
    const church = gltf.scene || gltf.scenes?.[0];
    if (!church) {
      console.error('GLTF loaded but contains no scene.');
      return;
    }
    church.scale.set(12, 12, 12);
    church.position.set(-100, 5, 300);
    church.quaternion.setFromEuler(new THREE.Euler(-0.01, Math.PI, 0));
    church.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(church);
  },
  // onProgress (optional)
  undefined,
  (error) => {
    console.log('An error happened while loading the GLTF model.');
    console.error('Error loading GLTF model:', error);
  }
);

const gasStationPosition = new THREE.Vector3(100, 5, 252);
loader.load(
  "/models/gas_station.glb",
  (gltf) => {
    const gasStation = gltf.scene || gltf.scenes?.[0];
    if (!gasStation) {
      console.error('GLTF loaded but contains no scene.');
      return;
    }
    gasStation.scale.set(12, 12, 12);
    gasStation.position.copy(gasStationPosition);
    gasStation.quaternion.setFromEuler(new THREE.Euler(-0.01, Math.PI, 0));
    gasStation.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(gasStation);
  },
  // onProgress (optional)
  undefined,
  (error) => {
    console.log('An error happened while loading the GLTF model.');
    console.error('Error loading GLTF model:', error);
  }
);

const biblePosition = new THREE.Vector3(120, 10, 240);
loader.load(
  "/models/bible.glb",
  (gltf) => {
    const bible = gltf.scene || gltf.scenes?.[0];
    if (!bible) {
      console.error('GLTF loaded but contains no scene.');
      return;
    }
    bible.scale.set(3, 3, 3);
    bible.position.copy(biblePosition);
    bible.quaternion.setFromEuler(new THREE.Euler(-0.01, Math.PI, 0));
    bible.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(bible);
  },
  // onProgress (optional)
  undefined,
  (error) => {
    console.log('An error happened while loading the GLTF model.');
    console.error('Error loading GLTF model:', error);
  }
);

const priestPosition = new THREE.Vector3(-100, 5, 340);
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
    loader.load(path, (object) => {
      // Apply initial transformations
      object.scale.copy(scale instanceof THREE.Vector3 ? scale : new THREE.Vector3(scale, scale, scale));
      object.rotation.copy(rotation);
      object.position.copy(position);
      
      // Enable shadows
      object.traverse((child) => {
        if (child.isMesh) {
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
      if (clips.length > 0) {
        resolve(clips[0]); // Return the first animation clip
      } else {
        reject(new Error('No animations found in file'));
      }
    }, undefined, reject);
  });
}

//==================Game state modals==================
function gameOver() {
  //create a modal overlay
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.color = 'white';
  modal.style.fontSize = '2em';
  modal.innerHTML = '<p>Game Over! The witch has caught you.</p><p>Press Ctrl+r to try again</p>';
  document.body.appendChild(modal);
}

function missionCompleteModal() {
  //create a modal overlay
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.color = 'white';
  modal.style.fontSize = '2em';
  modal.innerHTML = '<p>Mission Complete! You have helped the priest.</p><p>Loading next stage...</p>';
  document.body.appendChild(modal);
}
//==================Game state modals end==================

// Create entities
const player = new Player({
  position: { x: 0, y: 2, z: 0 },
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

const npc2 = new ChaserNPC({
  position: { x: 10, y: getTerrainHeight(20, 20) +4.9, z: 50 },
  modelPath: witch,
  maxSpeed: 20,
  stopDistance: 10,
  target: player,
  world,
  scene,
  mixers,
  entityManager,
  loadModel,
  loadAnimation,
  gameOver: gameOver
});

//==================Input handling==================
const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  p: false
};
let priestFound= false;
let bibleFound= false;
let missionComplete= false;
let isDialoguePlaying = false;
let chaserMoving= true;
window.addEventListener('keydown', (e) => {
  if(isDialoguePlaying) {
    return;
  }
  if( e.key === 'e' || e.key === 'E') {
    if(priestPosition.distanceTo(player.rigidBody.translation()) < 20) {
      console.log("E pressed near priest");
      if(bibleFound) {
        console.log("Starting dialogue with priest after finding bible");
        chaserMoving= false;
        priestFound= true;
        // subtitleElement.innerText = "Priest: Thank you for finding the bible!";
        // missionComplete= true;
        startDialogue2(startDialogue2,0);
        return;
      }
      console.log("Starting dialogue with priest");
      //subtitleElement.innerText = "Priest: We hid the bible at the gas station. Find it and bring it back here.";
      startDialogue1(startDialogue1,0);
    }
    if(biblePosition.distanceTo(player.rigidBody.translation()) < 20 && !bibleFound) {
      subtitleElement.innerText = "You found the bible! Return to the priest.";
      //remove bible from scene
      const bible = scene.children.find(child => child.position.equals(biblePosition));
      scene.remove(bible);
      bibleFound = true;
      priestFound= false;
    }
    return;
  }
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
//==================Input Handling end==================

//==================Dialogue system start==================
const dialogue1 = [
    "Preist: How did you walk through the wall?",
    "You: It's my magic power. I need your help.",
    "You: There is a little girl who is trapped by a witch",
    "Priest: I understand. We must find the bible to defeat the witch.",
    "Priest: We hid the bible at the gas station. Find it and bring it back here.",
    "You: Thank you, Father. I will find it.",
    "Find the bible"
  ];

const dialogue2 = [
    "You: Father, I have found the bible.",
    "Priest: Thank you, my child. With the bible, you can now banish the witch and save the girl.",
    "You: I will do my best. Thank you for your guidance."
  ];

function startDialogue1(dialogue, nextSentence) {
  isDialoguePlaying = true;
  if (nextSentence >= dialogue1.length-1) {
    subtitleElement.innerText = dialogue1[nextSentence];
    isDialoguePlaying = false;
    return;
  }
  subtitleElement.innerText = dialogue1[nextSentence];
  setTimeout(() => {
    startDialogue1(dialogue1, nextSentence + 1);
  }, 2000);
}

function startDialogue2(dialogue, nextSentence) {
  console.log("In startDialogue2, nextSentence:", nextSentence);
  isDialoguePlaying = true;
  if (nextSentence >= dialogue2.length) {
    missionComplete = true;
    isDialoguePlaying = false;
    missionCompleteModal();
    //move to level 2 after 3 seconds
    setTimeout(() => {
      window.location.href = "../stage2/stage2.html";
    }, 3000);
    return;
  }
  subtitleElement.innerText = dialogue2[nextSentence];
  setTimeout(() => {
    startDialogue2(dialogue2, nextSentence + 1);
  }, 3000);
}

//==================Dialogue system end==================
// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  if (!physicsReady) return;
  
  const delta = time.update().getDelta();
  
  // Update Yuka entities first
  entityManager.update(delta);
  
  // Update player
  player.handleInput(keys, delta);
  player.update(delta);
  
  // Update NPCs
  
  if(chaserMoving){
    npc2.update(delta);
    npc2.updateIndicator();
  }
  
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    if (projectiles[i].update()) {
      projectiles[i].dispose();
      projectiles.splice(i, 1);
    }
  }
  
  // Step physics simulation
  world.step();
  
  // Update mesh positions from physics
  if(player.model) {player.model.position.copy(player.rigidBody.translation());}
  if(npc2.model) {npc2.model.position.copy(npc2.rigidBody.translation());}

  if (!isDialoguePlaying) {
    let message = "";

    const playerPos = player.rigidBody.translation();
    const distToPriest = priestPosition.distanceTo(playerPos);
    const distToBible = biblePosition.distanceTo(playerPos);

    if (missionComplete) {
      message = "Mission Complete! You have helped the priest.";
    } else if (bibleFound && distToPriest < 20) {
      // Highest priority when returning with the bible
      message = "Press 'E' to give the bible to the priest";
    } else if (!bibleFound && distToBible < 20) {
      message = "Press 'E' to pick up the bible";
    } else if (!bibleFound && distToPriest < 20) {
      message = "Press 'E' to talk to the priest";
    } else if (!bibleFound) {
      message = "Find the bible";
    } else if (bibleFound && distToPriest >= 20) {
      message = "Return to the priest";
    }

    subtitleElement.innerText = message;
  }
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
  
  renderer.render(scene, camera);
}

animate();