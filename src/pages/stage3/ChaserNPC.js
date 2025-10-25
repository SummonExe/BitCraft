import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

import witchWalk from "../../../public/models/witch/Mutant Walking.fbx";
import witchIdle from "../../../public/models/witch/witch_Idle.fbx";
// const witchWalk = "../../../models/witch/Mutant Walking.fbx";
// const witchIdle = "../../../models/witch/witch_Idle.fbx";

export class ChaserNPC {
  constructor({ position, modelPath, maxSpeed, stopDistance, target, world, scene, mixers, entityManager, loadModel, loadAnimation }) {
    this.stopDistance = stopDistance;
    this.target = target;
    this.model = null;
    this.mixer = null;
    this.world = world;
    this.actions = { idle: null, walk: null };
    this.currentAction = null;
    
    // Debug indicator (optional - can be removed later)
    const indicatorGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const indicatorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    scene.add(this.indicator);
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync);
    
    // Seek behavior
    this.seekBehavior = new YUKA.SeekBehavior(target.entity.position);
    this.entity.steering.add(this.seekBehavior);
    
    // Physics setup - Adjusted for witch model proportions
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.5)  // Less damping for more responsive chasing
      .setAngularDamping(2.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    // Larger collider to match witch model size
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1.8, 3.5, 1.8); // Adjusted for witch
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Start async model loading
    this.loadPromise = this.loadModel(position, loadModel, loadAnimation, scene, mixers);
  }
  
  async loadModel(initialPosition, loadModel, loadAnimation, scene, mixers) {
    try {
      const scale = 10; // Large scale for witch model
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await loadModel(witchIdle, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      // Create mixer
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      // Load idle animation
      const idleClips = this.model.animations;
      if (idleClips.length > 0) {
        const idleClip = idleClips.find(clip => clip.name.toLowerCase().includes('idle')) || idleClips[0];
        this.actions.idle = this.mixer.clipAction(idleClip);
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
      }
      
      // Load walk animation
      const walkClip = await loadAnimation(witchWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.8; // Faster for witch
      
      // Enable shadows
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      // Sync with Yuka
      this.entity.setRenderComponent(this.model, this.sync);
      
    } catch (error) {
      console.error('ChaserNPC model loading failed:', error);
      // NO FALLBACK RECTANGLE - Let it fail gracefully
      throw error;
    }
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  updateIndicator() {
    // Optional debug indicator
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    const physicsPos = this.rigidBody.translation();
    this.indicator.position.copy(physicsPos).add(forward.multiplyScalar(3));
    this.indicator.position.y = physicsPos.y + 3.5;
  }
  
  update(delta) {
  const physicsPos = this.rigidBody.translation();
  this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);

  this.seekBehavior.target.copy(this.target.entity.position);

  const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
  const velocity = this.entity.velocity;
  const currentVel = this.rigidBody.linvel();

  if (distanceToTarget > this.stopDistance && velocity.length() > 0) {
    const lerpFactor = 0.4;
    const newVel = {
      x: currentVel.x + (velocity.x - currentVel.x) * lerpFactor,
      y: currentVel.y,
      z: currentVel.z + (velocity.z - currentVel.z) * lerpFactor
    };

    const maxSpeed = 8;
    const hSpeed = Math.sqrt(newVel.x ** 2 + newVel.z ** 2);
    if (hSpeed > maxSpeed) {
      const scale = maxSpeed / hSpeed;
      newVel.x *= scale;
      newVel.z *= scale;
    }

    this.rigidBody.setLinvel(newVel, true);

    // === FIX: Only rotate on Y-axis ===
    if (velocity.length() > 0) {
      const targetYRotation = Math.atan2(velocity.x, velocity.z);
      this.entity.rotation.set(0, targetYRotation, 0); // Upright only
    }

    if (this.mixer && this.actions.walk && this.currentAction !== this.actions.walk) {
      if (this.actions.idle) this.actions.idle.fadeOut(0.2);
      this.actions.walk.reset().fadeIn(0.2).play();
      this.currentAction = this.actions.walk;
    }
  } else {
    const stopVel = { x: currentVel.x * 0.85, y: currentVel.y, z: currentVel.z * 0.85 };
    this.rigidBody.setLinvel(stopVel, true);

    if (this.mixer && this.actions.idle && this.currentAction !== this.actions.idle) {
      if (this.actions.walk) this.actions.walk.fadeOut(0.2);
      this.actions.idle.reset().fadeIn(0.2).play();
      this.currentAction = this.actions.idle;
    }
  }

  if (this.mixer) this.mixer.update(delta);

  // === DEBUG INDICATOR: Ensure visible and attached ===
  if (this.indicator && this.model) {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    const headPos = new THREE.Vector3();
    this.model.getWorldPosition(headPos);
    headPos.y += 4; // Above witch head
    this.indicator.position.copy(headPos).add(forward.multiplyScalar(1));
    this.indicator.visible = true;
  }
}
}