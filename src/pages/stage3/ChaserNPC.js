import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

import witchWalk from "../../../src/assets/models/witch/Mutant Walking.fbx";
import witchIdle from "../../../src/assets/models/witch/witch_Idle.fbx";

export class ChaserNPC {
  constructor({ position, modelPath, maxSpeed, stopDistance, target, world, scene, mixers, entityManager, loadModel, loadAnimation }) {
    this.stopDistance = stopDistance;
    this.target = target;
    this.model = null;
    this.mixer = null;
    this.world = world;
    this.actions = { idle: null, walk: null };
    this.currentAction = null;
    
    // Direction indicator
    const indicatorGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const indicatorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    scene.add(this.indicator);
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync);
    
    // Steering behavior
    this.entity.steering.add(new YUKA.SeekBehavior(target.entity.position));
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.0) // Lowered to 0 to test physics
      .setAngularDamping(0.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(2, 7.5, 2);
    world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Load model and animations asynchronously
    this.loadModel(position, loadModel, loadAnimation, scene, mixers);
  }
  
  async loadModel(initialPosition, loadModel, loadAnimation, scene, mixers) {
    try {
      const scale = 10;
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await loadModel(witchIdle, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      const idleClips = this.model.animations;
      if (idleClips.length > 0) {
        const idleClip = idleClips.find(clip => clip.name.toLowerCase().includes('idle')) || idleClips[0];
        this.actions.idle = this.mixer.clipAction(idleClip);
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
      }
      
      const walkClip = await loadAnimation(witchWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6;
      
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Failed to load chaser model or animations:', error);
      this.createFallbackBox(0xff0000, scene);
    }
  }
  
  createFallbackBox(color, scene) {
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
    this.indicator.position.y = physicsPos.y + 7.5;
  }
  
  update(delta) {
    const physicsPos = this.rigidBody.translation();
    this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    
    // Update seek target to current player position
    this.entity.steering.behaviors[0].target.copy(this.target.entity.position);
    
    const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
    const velocity = this.entity.velocity;
    const currentVel = this.rigidBody.linvel();
    const maxSpeed = 7;
    
    // Debug logs to diagnose static distance
    // console.log('ChaserNPC - Witch Pos:', this.entity.position, 'Player Pos:', this.target.entity.position, 'Distance:', distanceToTarget, 'Velocity:', velocity, 'CurrentVel:', currentVel);
    
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
      
      // console.log('ChaserNPC - Applying velocity:', newVel);
      this.rigidBody.setLinvel(newVel, true);
      
      // Rotate to face movement direction
      if (velocity.length() > 0) {
        const targetRotation = Math.atan2(velocity.x, velocity.z);
        this.entity.rotation.fromEuler(0, targetRotation, 0);
      }
      
      // Play walk animation
      if (this.mixer && this.actions.idle && this.actions.walk && this.currentAction !== this.actions.walk) {
        this.actions.idle.fadeOut(0.2);
        this.actions.walk.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.walk;
      }
    } else {
      const stopVel = { x: currentVel.x * 0.8, y: currentVel.y, z: currentVel.z * 0.8 };
      // console.log('ChaserNPC - Stopping, velocity:', stopVel);
      this.rigidBody.setLinvel(stopVel, true);
      
      // Play idle animation
      if (this.mixer && this.actions.idle && this.actions.walk && this.currentAction !== this.actions.idle) {
        this.actions.walk.fadeOut(0.2);
        this.actions.idle.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.idle;
      }
    }
    
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }
}