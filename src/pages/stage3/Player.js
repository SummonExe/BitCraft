import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { Projectile } from './Projectile.js';

import hero from "../../../src/assets/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import heroWalk from "../../../src/assets/models/cop/Magic Spell Pack/Walking.fbx";
import heroRun from "../../../src/assets/models/cop/Magic Spell Pack/Unarmed Run Forward.fbx";
import heroIdle from "../../../src/assets/models/cop/Magic Spell Pack/Unarmed Idle.fbx";
import heroHit1 from "../../../src/assets/models/cop/Magic Spell Pack/Standing 2H Magic Attack 01.fbx";

export class Player {
  constructor({ position, modelPath, maxSpeed, moveForce, world, scene, mixers, entityManager, loadModel, loadAnimation, projectiles }) {
    this.moveForce = moveForce;
    this.modelPath = modelPath;
    this.isMoving = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null, attack: null };
    this.currentAction = null;
    this.world = world;
    this.scene = scene;
    this.projectiles = projectiles;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.rotationSpeed = 0.05;
    
    // Yuka entity
    this.entity = new YUKA.Vehicle();
    this.entity.maxSpeed = maxSpeed;
    this.entity.position.set(position.x, position.y, position.z);
    this.entity.setRenderComponent(null, this.sync);
    
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
    
    // EXPOSE LOAD PROMISE
    this.loadPromise = this.loadModel(position, loadModel, loadAnimation, scene, mixers);
  }
  
  async loadModel(initialPosition, loadModel, loadAnimation, scene, mixers) {
    try {
      const scale = 0.05;
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      const idleClip = await loadAnimation(heroIdle);
      this.actions.idle = this.mixer.clipAction(idleClip);
      this.actions.idle.play();
      this.currentAction = this.actions.idle;
      
      const walkClip = await loadAnimation(heroWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6;
      
      const attackClip = await loadAnimation(heroHit1);
      this.actions.attack = this.mixer.clipAction(attackClip);
      this.actions.attack.setLoop(THREE.LoopOnce);
      this.actions.attack.clampWhenFinished = true;
      
      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.actions.attack) {
          this.actions.attack.fadeOut(0.3);
          this.actions.idle.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.idle;
        }
      });
      
      this.entity.setRenderComponent(this.model, this.sync);
    } catch (error) {
      console.error('Player model load failed:', error);
      throw error;
    }
  }
  
  sync(entity, renderComponent) {
    renderComponent.position.copy(entity.position);
    renderComponent.quaternion.copy(entity.rotation);
  }
  
  update(delta) {
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
    
    if (keys.ArrowUp) velocity.z = 1;
    if (keys.ArrowDown) velocity.z = -1;
    if (keys.ArrowLeft) rotationInput += 1;
    if (keys.ArrowRight) rotationInput -= 1;
    
    this.isMoving = velocity.length() > 0 || rotationInput !== 0;
    
    if (keys.p && this.actions.attack && this.currentAction !== this.actions.attack) {
      if (this.currentAction) this.currentAction.fadeOut(0.3);
      this.actions.attack.reset().fadeIn(0.3).play();
      this.currentAction = this.actions.attack;
      
      const physicsPos = this.rigidBody.translation();
      const startPosition = new THREE.Vector3(physicsPos.x, physicsPos.y + 15, physicsPos.z);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
      forward.y = 0; forward.normalize();
      
      const projectile = new Projectile({ position: startPosition, direction: forward }, { world: this.world, scene: this.scene });
      this.projectiles.push(projectile);
    }
    
    if (rotationInput !== 0) {
      this.targetRotation += rotationInput * delta * 4;
    }
    
    const rotationDiff = this.targetRotation - this.currentRotation;
    const normalizedDiff = ((rotationDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    this.currentRotation += normalizedDiff * this.rotationSpeed;
    this.entity.rotation.fromEuler(0, this.currentRotation, 0);
    
    if (velocity.length() > 0) {
      velocity.applyQuaternion(this.entity.rotation);
      velocity.normalize().multiplyScalar(this.moveForce);
      this.rigidBody.applyImpulse({ x: velocity.x, y: 0, z: velocity.z }, true);
    } else {
      const linvel = this.rigidBody.linvel();
      if (Math.abs(linvel.x) > 0.01 || Math.abs(linvel.z) > 0.01) {
        this.rigidBody.setLinvel({ x: linvel.x * 0.9, y: linvel.y, z: linvel.z * 0.9 }, true);
      } else {
        this.rigidBody.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
      }
    }
    
    const physicsPos = this.rigidBody.translation();
    this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
  }
}