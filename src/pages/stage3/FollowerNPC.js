import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

const kidWalk = "../../../models/kid2/Female Walk.fbx";
const kidIdle = "../../../models/kid2/Idle.fbx";

export class FollowerNPC {
  constructor({ position, modelPath, maxSpeed, followDistance, stopThreshold, target, world, scene, mixers, entityManager, loadModel, loadAnimation }) {
    this.followDistance = followDistance;
    this.stopThreshold = stopThreshold;
    this.target = target;
    this.modelPath = modelPath;
    this.isStopped = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null };
    this.currentAction = null;
    this.world = world;
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync);
    
    // Steering behaviors
    this.offsetBehavior = new YUKA.OffsetPursuitBehavior(target.entity, new YUKA.Vector3(0, 0, followDistance));
    this.entity.steering.add(this.offsetBehavior);
    this.entity.steering.add(new YUKA.ObstacleAvoidanceBehavior([target.entity]));
    
    // Physics setup - Smaller collider for kid model
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(2.0)
      .setAngularDamping(5.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    // Match collider to kid model size (smaller than default)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.8, 1.8, 0.8); // Adjusted for kid proportions
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Start async model loading
    this.loadPromise = this.loadModel(position, loadModel, loadAnimation, scene, mixers);
  }
  
  async loadModel(initialPosition, loadModel, loadAnimation, scene, mixers) {
    try {
      const scale = 0.1;
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      // Create mixer and add to global mixers array
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      // Load idle animation from model
      const idleClips = this.model.animations;
      if (idleClips.length > 0) {
        const idleClip = idleClips.find(clip => clip.name.toLowerCase().includes('idle')) || idleClips[0];
        this.actions.idle = this.mixer.clipAction(idleClip);
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
      }
      
      // Load walk animation separately
      const walkClip = await loadAnimation(kidWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6;
      
      // Enable shadows on model
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // Sync model with Yuka entity
      this.entity.setRenderComponent(this.model, this.sync);
      
    } catch (error) {
      console.error('FollowerNPC model loading failed:', error);
      // NO FALLBACK RECTANGLE - Let it fail gracefully
      throw error;
    }
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  update(delta) {
  // Update animations
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

  // Sync physics to Yuka
  const physicsPos = this.rigidBody.translation();
  this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);

  // === AI LOGIC ===
  const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
  const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.entity.rotation);
  playerForward.y = 0; playerForward.normalize();

  const toNPC = new THREE.Vector3().subVectors(this.entity.position, this.target.entity.position);
  toNPC.y = 0; toNPC.normalize();
  const dotProduct = playerForward.dot(toNPC);
  const isBehind = dotProduct < 0;

  if (distanceToTarget <= this.stopThreshold && isBehind) {
    this.entity.steering.behaviors.forEach(b => b.active = false);
    this.rigidBody.setLinvel({ x: 0, y: this.rigidBody.linvel().y, z: 0 }, true);
    this.isStopped = true;
  } else {
    this.entity.steering.behaviors.forEach(b => b.active = true);
    
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.target.entity.rotation);
    forward.y = 0; forward.normalize().multiplyScalar(-this.followDistance);
    this.offsetBehavior.offset.set(forward.x, forward.y, forward.z);

    const velocity = this.entity.velocity;
    if (velocity.length() > 0) {
      const currentVel = this.rigidBody.linvel();
      this.rigidBody.setLinvel({ x: velocity.x, y: currentVel.y, z: velocity.z }, true);

      // === FIX: Only rotate on Y-axis ===
      const targetYRotation = Math.atan2(velocity.x, velocity.z);
      this.entity.rotation.set(0, targetYRotation, 0); // No X/Z tilt
    }
    this.isStopped = false;
  }

  // === DEBUG: Add small indicator (optional) ===
  if (!this.debugIndicator && this.model) {
    const geom = new THREE.SphereGeometry(0.3, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.debugIndicator = new THREE.Mesh(geom, mat);
    this.model.add(this.debugIndicator);
    this.debugIndicator.position.set(0, 2.5, 0); // Above head
  }
}
}