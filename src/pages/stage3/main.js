import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Initialize Rapier physics
let world, physicsReady = false;

await RAPIER.init();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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

// Projectile class
class Projectile {
  constructor(position, direction) {
    // Visual setup
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.ball(0.5);
    world.createCollider(colliderDesc, this.rigidBody);
    
    // Apply impulse
    const speed = 20; // 20 units per second
    const impulse = { x: direction.x * speed, y: 0, z: direction.z * speed };
    this.rigidBody.applyImpulse(impulse, true);
    
    // Track starting position for distance calculation
    this.startPosition = position.clone();
  }
  
  update() {
    const physicsPos = this.rigidBody.translation();
    this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    
    // Check distance traveled
    const distance = this.startPosition.distanceTo(new THREE.Vector3(physicsPos.x, physicsPos.y, physicsPos.z));
    if (distance >= 20) {
      return true; // Signal to remove
    }
    return false;
  }
  
  dispose() {
    scene.remove(this.mesh);
    world.removeRigidBody(this.rigidBody);
  }
}

// Player and NPC classes
class Player {
  constructor({ position, modelPath, maxSpeed, moveForce }) {
    this.moveForce = moveForce;
    this.modelPath = modelPath;
    this.isMoving = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null, attack: null };
    this.currentAction = null;

    // NEW: Rotation properties
    this.targetRotation = 0; // Target rotation in radians
    this.currentRotation = 0; // Current rotation in radians
    this.rotationSpeed = 0.15; // Rotation smoothing speed
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync); // Will be set after loading
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(2.0)
      .setAngularDamping(5.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1, 2, 1);
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Load model and animations asynchronously
    this.loadModel(position);
  }
  
  async loadModel(initialPosition) {
    try {
      // Model scale and rotation - adjusted for Mixamo
      const scale = 0.05; // Mixamo models are in cm, scale to meters
      const rotation = new THREE.Euler(0, Math.PI, 0); // Face positive Z
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      // Set up animation mixer
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      // Load idle animation from external file
      const idleClip = await loadAnimation('./models/cop/Magic Spell Pack/Unarmed Idle.fbx');
      this.actions.idle = this.mixer.clipAction(idleClip);
      this.actions.idle.play();
      this.currentAction = this.actions.idle;
      
      // Load walk animation
      const walkClip = await loadAnimation('./models/cop/Magic Spell Pack/Walking.fbx');
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6; // Slow down walk animation
      
      // Load attack animation
      const attackClip = await loadAnimation('./models/cop/Magic Spell Pack/Standing 1H Magic Attack 03.fbx');
      this.actions.attack = this.mixer.clipAction(attackClip);
      this.actions.attack.setLoop(THREE.LoopOnce);
      this.actions.attack.clampWhenFinished = true;
      
      // Handle animation finish
      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.actions.attack) {
          if (this.isMoving && this.currentAction !== this.actions.walk) {
            this.actions.attack.fadeOut(0.3);
            this.actions.walk.reset().fadeIn(0.3).play();
            this.currentAction = this.actions.walk;
          } else if (!this.isMoving && this.currentAction !== this.actions.idle) {
            this.actions.attack.fadeOut(0.3);
            this.actions.idle.reset().fadeIn(0.3).play();
            this.currentAction = this.actions.idle;
          }
        }
      });
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Failed to load player model or animations:', error);
      // Fallback to box if model fails to load
      this.createFallbackBox(0x0000ff);
    }
  }
  
  createFallbackBox(color) {
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const material = new THREE.MeshStandardMaterial({ color });
    this.model = new THREE.Mesh(geometry, material);
    this.model.castShadow = true;
    scene.add(this.model);
    this.entity.setRenderComponent(this.model, this.sync);
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  update(delta) {
    // Update animation based on movement
    if (this.mixer && this.actions.idle && this.actions.walk && this.actions.attack) {
      if (this.currentAction !== this.actions.attack) {
        if (this.isMoving && this.currentAction !== this.actions.walk) {
          this.actions.idle.fadeOut(0.3);
          this.actions.walk.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.walk;
        } else if (!this.isMoving && this.currentAction !== this.actions.idle) {
          this.actions.walk.fadeOut(0.3);
          this.actions.idle.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.idle;
        }
      }
      this.mixer.update(delta);
    }
  }
  
handleInput(keys, delta) {
  const velocity = new THREE.Vector3();
  let rotationInput = 0;
  
  // Movement input
  if (keys.ArrowUp) velocity.z = 1;
  if (keys.ArrowDown) velocity.z = -1;
  if (keys.ArrowLeft) velocity.x = -1;
  if (keys.ArrowRight) velocity.x = 1;
  
  // FIXED: Correct rotation directions
  if (keys.ArrowLeft) rotationInput += 1;  // Changed from -= to +
  if (keys.ArrowRight) rotationInput -= 1; // Changed from += to -
  
  this.isMoving = velocity.length() > 0 || rotationInput !== 0;
  
  // Handle cumulative rotation
  if (rotationInput !== 0) {
    // Apply rotation based on input
    this.targetRotation += rotationInput * delta * 4; // 4 radians per second rotation speed
  }
  
  // Smoothly interpolate rotation
  const rotationDiff = this.targetRotation - this.currentRotation;
  // Normalize the difference to take the shortest path
  const normalizedDiff = ((rotationDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
  this.currentRotation += normalizedDiff * this.rotationSpeed;
  
  // Apply the smoothed rotation to the entity
  this.entity.rotation.fromEuler(0, this.currentRotation, 0);
  
  // Handle attack
  if (keys.p && this.actions.attack && this.currentAction !== this.actions.attack) {
    // Play attack animation
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }
    this.actions.attack.reset().fadeIn(0.3).play();
    this.currentAction = this.actions.attack;
    
    // Launch projectile in the direction the player is facing
    const physicsPos = this.rigidBody.translation();
    const startPosition = new THREE.Vector3(physicsPos.x, physicsPos.y + 15, physicsPos.z);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    forward.y = 0;
    forward.normalize();
    const projectile = new Projectile(startPosition, forward);
    projectiles.push(projectile);
  }
  
  // Handle movement relative to player's facing direction
  if (velocity.length() > 0) {
    // Transform movement direction based on player's current rotation
    velocity.applyQuaternion(this.entity.rotation);
    velocity.normalize().multiplyScalar(this.moveForce);
    this.rigidBody.applyImpulse({ x: velocity.x, y: 0, z: velocity.z }, true);
  } else {
    // Dampen velocity to stop gliding
    const linvel = this.rigidBody.linvel();
    if (Math.abs(linvel.x) > 0.01 || Math.abs(linvel.z) > 0.01) {
      this.rigidBody.setLinvel({ x: linvel.x * 0.9, y: linvel.y, z: linvel.z * 0.9 }, true);
    } else {
      this.rigidBody.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
    }
  }
  
  // Update physics position
  const physicsPos = this.rigidBody.translation();
  this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
}
}

class FollowerNPC {
  constructor({ position, modelPath, maxSpeed, followDistance, stopThreshold, target }) {
    this.followDistance = followDistance;
    this.stopThreshold = stopThreshold;
    this.target = target;
    this.modelPath = modelPath;
    this.isStopped = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null };
    this.currentAction = null;
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync); // Will be set after loading
    
    // Steering behaviors
    this.offsetBehavior = new YUKA.OffsetPursuitBehavior(target.entity, new YUKA.Vector3(0, 0, followDistance));
    this.entity.steering.add(this.offsetBehavior);
    this.entity.steering.add(new YUKA.ObstacleAvoidanceBehavior([target.entity]));
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(2.0)
      .setAngularDamping(5.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1, 2, 1);
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Load model and animations asynchronously
    this.loadModel(position);
  }
  
  async loadModel(initialPosition) {
    try {
      // Model scale and rotation - adjusted for Mixamo
      const scale = 0.1; // Mixamo models are in cm, scale to meters
      const rotation = new THREE.Euler(0, Math.PI, 0); // Face positive Z
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      // Set up animation mixer
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      // Load idle animation (from model file)
      const idleClips = this.model.animations;
      if (idleClips.length > 0) {
        const idleClip = idleClips.find(clip => clip.name.toLowerCase().includes('idle')) || idleClips[0];
        this.actions.idle = this.mixer.clipAction(idleClip);
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
      }
      
      // Load walk animation
      const walkClip = await loadAnimation('./models/kid2/Female Walk.fbx');
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6; // Slow down walk animation
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Failed to load follower model or animations:', error);
      // Fallback to box if model fails to load
      this.createFallbackBox(0x00ff00);
    }
  }
  
  createFallbackBox(color) {
    const geometry = new THREE.BoxGeometry(2, 4, 2);
    const material = new THREE.MeshStandardMaterial({ color });
    this.model = new THREE.Mesh(geometry, material);
    this.model.castShadow = true;
    scene.add(this.model);
    this.entity.setRenderComponent(this.model, this.sync);
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  update(delta) {
    // Update animation based on movement
    if (this.mixer && this.actions.idle && this.actions.walk) {
      if (!this.isStopped && this.currentAction !== this.actions.walk) {
        this.actions.idle.fadeOut(0.2);
        this.actions.walk.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.walk;
      } else if (this.isStopped && this.currentAction !== this.actions.idle) {
        this.actions.walk.fadeOut(0.2);
        this.actions.idle.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.idle;
      }
      this.mixer.update(delta);
    }
    
    const physicsPos = this.rigidBody.translation();
    this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    
    const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
    if (distanceToTarget <= this.stopThreshold) {
      this.entity.steering.behaviors.forEach(behavior => behavior.active = false);
      this.rigidBody.setLinvel({ x: 0, y: this.rigidBody.linvel().y, z: 0 }, true);
      this.isStopped = true;
    } else {
      this.entity.steering.behaviors.forEach(behavior => behavior.active = true);
      
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.entity.rotation);
      forward.y = 0;
      forward.normalize().multiplyScalar(-this.followDistance);
      this.offsetBehavior.offset.set(forward.x, forward.y, forward.z);
      
      const velocity = this.entity.velocity;
      const currentVel = this.rigidBody.linvel();
      if (velocity.length() > 0) {
        this.rigidBody.setLinvel({ x: velocity.x, y: currentVel.y, z: velocity.z }, true);
      }
      this.isStopped = false;
    }
  }
}

class ChaserNPC {
  constructor({ position, modelPath, maxSpeed, stopDistance, target }) {
    this.stopDistance = stopDistance;
    this.target = target;
    this.model = null; // Will be set after loading
    this.mixer = null; // Placeholder for future animation
    
    // Direction indicator
    const indicatorGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const indicatorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    scene.add(this.indicator);
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync); // Will be set after loading
    
    // Steering behavior
    this.entity.steering.add(new YUKA.SeekBehavior(target.entity.position));
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(8.0)
      .setAngularDamping(10.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(2.5, 7.5, 2.5);
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Load model asynchronously
    this.loadModel(position);
  }
  
  async loadModel(initialPosition) {
    try {
      // Model scale and rotation - adjusted for Mixamo
      const scale = 10; // Match player scale
      const rotation = new THREE.Euler(0, Math.PI, 0); // Face positive Z
      this.model = await loadModel('./models/witch/witch_Idle.fbx', scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      // Enable shadows
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Failed to load chaser model:', error);
      // Fallback to box if model fails to load
      this.createFallbackBox(0xff0000);
    }
  }
  
  createFallbackBox(color) {
    const geometry = new THREE.BoxGeometry(5, 15, 5);
    const material = new THREE.MeshStandardMaterial({ color });
    this.model = new THREE.Mesh(geometry, material);
    this.model.castShadow = true;
    scene.add(this.model);
    this.entity.setRenderComponent(this.model, this.sync);
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  updateIndicator() {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    const physicsPos = this.rigidBody.translation();
    this.indicator.position.copy(physicsPos).add(forward.multiplyScalar(3));
    this.indicator.position.y = physicsPos.y + 7.5; // Adjusted for model height
  }
  
  update(delta) {
    const physicsPos = this.rigidBody.translation();
    this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    
    const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
    const velocity = this.entity.velocity;
    const currentVel = this.rigidBody.linvel();
    const maxSpeed = 7;
    
    if (distanceToTarget > this.stopDistance && velocity.length() > 0) {
      const desiredVel = { x: velocity.x, y: currentVel.y, z: velocity.z };
      const lerpFactor = 0.3;
      const newVel = {
        x: currentVel.x + (desiredVel.x - currentVel.x) * lerpFactor,
        y: currentVel.y,
        z: currentVel.z + (desiredVel.z - currentVel.z) * lerpFactor
      };
      
      const horizontalSpeed = Math.sqrt(newVel.x * newVel.x + newVel.z * newVel.z);
      if (horizontalSpeed > maxSpeed) {
        const scale = maxSpeed / horizontalSpeed;
        newVel.x *= scale;
        newVel.z *= scale;
      }
      
      this.rigidBody.setLinvel(newVel, true);
    } else if (distanceToTarget <= this.stopDistance) {
      const stopVel = { x: currentVel.x * 0.8, y: currentVel.y, z: currentVel.z * 0.8 };
      this.rigidBody.setLinvel(stopVel, true);
    }
  }
}

// Create entities
const player = new Player({
  position: { x: 0, y: 8, z: 0 },
  modelPath: './models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx',
  maxSpeed: 8,
  moveForce: 30
});

const npc1 = new FollowerNPC({
  position: { x: -10, y: 8, z: 10 },
  modelPath: './models/kid2/Idle.fbx',
  maxSpeed: 20,
  followDistance: 10,
  stopThreshold: 12,
  target: player
});

const npc2 = new ChaserNPC({
  position: { x: 20, y: 9, z: 20 },
  modelPath: './models/witch/witch_Idle.fbx',
  maxSpeed: 15,
  stopDistance: 40,
  target: player
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
const lerpFactor = 0.1; // Adjust for smoother/faster camera movement
camera.position.lerp(desiredPosition, lerpFactor);

// Look at player (slightly above their position)
const lookAtTarget = new THREE.Vector3(playerPos.x, playerPos.y + 3, playerPos.z);
camera.lookAt(lookAtTarget);
  
  renderer.render(scene, camera);
}

animate();