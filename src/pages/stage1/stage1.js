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

// Initialize Rapier physics
let world, physicsReady = false;
const subtitleElement = document.getElementById('info-text');
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

// Create UI elements
const timerElement = document.createElement('div');
timerElement.style.position = 'absolute';
timerElement.style.top = '20px';
timerElement.style.left = '20px';
timerElement.style.color = 'white';
timerElement.style.fontSize = '24px';
timerElement.style.fontFamily = 'Arial, sans-serif';
timerElement.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
timerElement.style.zIndex = '1000';
document.body.appendChild(timerElement);

const bibleBarElement = document.createElement('div');
bibleBarElement.style.position = 'absolute';
bibleBarElement.style.top = '60px';
bibleBarElement.style.left = '20px';
bibleBarElement.style.color = '#FFD700';
bibleBarElement.style.fontSize = '20px';
bibleBarElement.style.fontFamily = 'Arial, sans-serif';
bibleBarElement.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
bibleBarElement.style.display = 'none';
bibleBarElement.style.zIndex = '1000';
bibleBarElement.innerText = '📖 BIBLE COLLECTED!';
document.body.appendChild(bibleBarElement);

// Load the Solo model as the ground
const loader = new GLTFLoader();
let soloModelMesh = null;

loader.load(
  soloModel,
  (gltf) => {
    const soloScene = gltf.scene || gltf.scenes?.[0];
    if (!soloScene) {
      console.error('GLTF loaded but contains no scene.');
      return;
    }
    
    soloModelMesh = soloScene;
    soloScene.scale.set(10, 10, 10);
    soloScene.position.set(0, 0, 0);
    soloScene.updateMatrixWorld(true);
    
    soloScene.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;
        
        const geometry = child.geometry;
        if (geometry && geometry.attributes.position) {
          try {
            const worldMatrix = child.matrixWorld;
            const positionAttribute = geometry.attributes.position;
            const vertices = [];
            for (let i = 0; i < positionAttribute.count; i++) {
              const vertex = new THREE.Vector3();
              vertex.fromBufferAttribute(positionAttribute, i);
              vertex.applyMatrix4(worldMatrix);
              vertices.push(vertex.x, vertex.y, vertex.z);
            }
            const verticesArray = new Float32Array(vertices);
            let indicesArray = geometry.index
              ? new Uint32Array(geometry.index.array)
              : new Uint32Array([...Array(positionAttribute.count).keys()]);
            
            const colliderDesc = RAPIER.ColliderDesc.trimesh(verticesArray, indicesArray);
            colliderDesc.setRestitution(0.0);
            colliderDesc.setFriction(1.0);
            world.createCollider(colliderDesc);
          } catch (e) {
            console.warn('Could not create collider for mesh:', child.name, e);
          }
        }
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
  },
  (progress) => console.log('Loading solo model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
  (error) => console.error('Error loading solo model:', error)
);

// Load the Church model with interior physics
loader.load(
  finalChurch,
  (gltf) => {
    const church = gltf.scene || gltf.scenes?.[0];
    if (!church) {
      console.error('Church GLTF loaded but contains no scene.');
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
        
        const geometry = child.geometry;
        if (geometry && geometry.attributes.position) {
          try {
            const worldMatrix = child.matrixWorld;
            const positionAttribute = geometry.attributes.position;
            const vertices = [];
            for (let i = 0; i < positionAttribute.count; i++) {
              const vertex = new THREE.Vector3();
              vertex.fromBufferAttribute(positionAttribute, i);
              vertex.applyMatrix4(worldMatrix);
              vertices.push(vertex.x, vertex.y, vertex.z);
            }
            const verticesArray = new Float32Array(vertices);
            let indicesArray = geometry.index
              ? new Uint32Array(geometry.index.array)
              : new Uint32Array([...Array(positionAttribute.count).keys()]);
            
            const colliderDesc = RAPIER.ColliderDesc.trimesh(verticesArray, indicesArray);
            colliderDesc.setRestitution(0.0);
            colliderDesc.setFriction(1.0);
            world.createCollider(colliderDesc);
            console.log('Created collider for church mesh:', child.name);
          } catch (e) {
            console.warn('Could not create collider for church mesh:', child.name, e);
          }
        }
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
  },
  (progress) => console.log('Loading church model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
  (error) => console.error('Error loading church model:', error)
);

// Load the Bible model
loader.load(
  Bible,
  (gltf) => {
    const bible = gltf.scene || gltf.scenes?.[0];
    if (!bible) {
      console.error('Bible GLTF loaded but contains no scene.');
      return;
    }
    
    bibleMesh = bible;
    bible.scale.set(10, 10, 10);
    bible.position.set(3002, 15, -1250);
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
            mat.emissiveIntensity = 0.3;
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
  },
  (progress) => console.log('Loading bible model:', (progress.loaded / progress.total * 100).toFixed(2) + '%'),
  (error) => console.error('Error loading bible model:', error)
);

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

// Create player
const player = new Player({
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

// Input handling
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, p: false, Shift: false, e: false };
window.addEventListener('keydown', (e) => { 
  if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
  if (e.key === 'Shift') keys.Shift = true;
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
  
  // Check if player is close enough and pressing Shift+P
  if (distance < 30 && keys.Shift && keys.e) {
    bibleCollected = true;
    collectionTime = Date.now();
    
    // Remove bible from scene
    scene.remove(bibleMesh);
    
    // Show collection UI
    bibleBarElement.style.display = 'block';
    
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

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  if (!physicsReady) return;
  
  // Start timer on first frame
  if (!gameStartTime) {
    gameStartTime = Date.now();
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
    
    // Update timer
    const elapsedTime = Date.now() - gameStartTime;
    const timeDisplay = bibleCollected 
      ? `Time to collect: ${formatTime(collectionTime - gameStartTime)}`
      : `Time: ${formatTime(elapsedTime)}`;
    timerElement.innerText = timeDisplay;
    
    // Update subtitle with position and instructions
    const bibleInstruction = !bibleCollected && bibleMesh 
      ? ' | Press Shift+P near Bible to collect'
      : '';
    subtitleElement.innerText = `Player Position: X:${pos.x.toFixed(1)} Y:${pos.y.toFixed(1)} Z:${pos.z.toFixed(1)} | Use Arrow Keys to move${bibleInstruction}`;
  }
  
  mixers.forEach(mixer => mixer.update(delta));
  
  // Animate bible rotation
  if (bibleMesh && !bibleCollected) {
    bibleMesh.rotation.y += delta * 0.5;
    bibleMesh.position.y = 11 + Math.sin(Date.now() * 0.002) * 0.5;
  }
  
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
    const dx = pos.x - 2860;
    const dz = pos.z - (-940);
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 15) {
      player.rigidBody.setTranslation({ x: 2927, y: 9.0, z: -1067 }, true);
      if (player.model) player.model.position.set(2827, 9.8, -1044);
      console.log("Player teleported to church interior area");
    }
  }
  
  renderer.render(scene, camera);
}

animate();