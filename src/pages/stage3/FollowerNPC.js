import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

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
    this.loadModel(position, loadModel, loadAnimation, scene, mixers);
  }
  
  async loadModel(initialPosition, loadModel, loadAnimation, scene, mixers) {
    try {
      const scale = 0.1; // Mixamo models are in cm, scale to meters
      const rotation = new THREE.Euler(0, Math.PI, 0); // Face positive Z
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      const idleClips = this.model.animations;
      if (idleClips.length > 0) {
        const idleClip = idleClips.find(clip => clip.name.toLowerCase().includes('idle')) || idleClips[0];
        this.actions.idle = this.mixer.clipAction(idleClip);
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
      }
      
      const walkClip = await loadAnimation('./models/kid2/Female Walk.fbx');
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6;
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Failed to load follower model or animations:', error);
      this.createFallbackBox(0x00ff00, scene);
    }
  }
  
  createFallbackBox(color, scene) {
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