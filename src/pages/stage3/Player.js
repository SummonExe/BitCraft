import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { Projectile } from './Projectile.js';

import points from "../../../public/gamestate.json";
// Load gamestate from localStorage (fallback to imported points if no save)
const gamestate = JSON.parse(localStorage.getItem('gamestate')) || points;
// Extract values
const timeTaken = gamestate.time;
const score = gamestate['holy-water'];

// Define max values
const maxTime = 130;
const maxScore = 20;
// Compute mapped values (linear interpolation)
const value1 = (timeTaken / maxTime) * 2;
const value2 = (score / maxScore) * 1.5;

// Clamp to valid ranges (prevent negative/extreme values)
const clampedValue1 = Math.max(0, Math.min(value1, 2));
const clampedValue2 = Math.max(0, Math.min(value2, 1.5));

// Adjustment factor
const adjustment = clampedValue1 - clampedValue2;

import hero from "../../../public/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import heroDying from "../../../public/models/cop/Magic Spell Pack/Standing React Death Backward.fbx";
import heroAttacked from "../../../public/models/cop/Magic Spell Pack/Standing React Small From Front.fbx";
import heroWalk from "../../../public/models/cop/Magic Spell Pack/Walking.fbx";
import heroRun from "../../../public/models/cop/Magic Spell Pack/Unarmed Run Forward.fbx";
import heroIdle from "../../../public/models/cop/Magic Spell Pack/Unarmed Idle.fbx";
import heroHitP from "../../../public/models/cop/Magic Spell Pack/Standing 2H Magic Attack 01.fbx";
import heroHitL from "../../../public/models/cop/Magic Spell Pack/Standing 2H Magic Area Attack 01.fbx";
import heroHitO from "../../../public/models/cop/Magic Spell Pack/Standing 2H Magic Attack 03.fbx";
import heroHitK from "../../../public/models/cop/Magic Spell Pack/Standing 2H Magic Attack 04.fbx";
import heroHitI from "../../../public/models/cop/Magic Spell Pack/Standing 2H Magic Attack 05.fbx";
import heroHitJ from "../../../public/models/cop/Magic Spell Pack/Standing 1H Magic Attack 03.fbx";
import heroBlock from "../../../public/models/cop/Magic Spell Pack/Standing Block React Large.fbx";

import powerP from "../../../public/models/projectiles/rasengan.glb";
import powerL from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerO from "../../../public/models/projectiles/adorned_metal_sphere.glb";
import powerK from "../../../public/models/projectiles/adorned_metal_sphere.glb";
import powerI from "../../../public/models/projectiles/speakerman_cross_effect.glb";
import powerJ from "../../../public/models/projectiles/exoplanet_sg10446623.glb";

export class Player {
  constructor({ position, modelPath, maxSpeed, moveForce, world, scene, mixers, entityManager, loadModel, loadAnimation, projectiles, attackProjectileConfigs = null, camera }) {
    this.baseMoveForce = moveForce;
    this.moveForce = moveForce;
    this.modelPath = modelPath;
    this.isMoving = false;
    this.isRunning = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null, run: null, hit: null, dying: null };
    this.attacks = {};
    this.currentAction = null;
    this.world = world;
    this.scene = scene;
    this.projectiles = projectiles;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.rotationSpeed = 0.05;
    this.modelLoader = loadModel;
    this.animationLoader = loadAnimation;
    this.camera = camera;
    
    // Control mode: 'keyboard' or 'orbit'
    this.controlMode = 'keyboard';
    
    // ATTACK COOLDOWN
    this.attackCooldown = 0;
    this.attackCooldownDuration = 1.0;
    this.baseAttackSpeed = 50;
    
    this.attackCooldowns = {
      'p': { duration: Math.max(0.0, 2.0 + adjustment), remaining: 0 },
      'l': { duration: Math.max(0.0, 4.0 + adjustment), remaining: 0 },
      'o': { duration: Math.max(0.0, 2.0 + adjustment), remaining: 0 },
      'k': { duration: Math.max(0.0, 4.0 + adjustment), remaining: 0 },
      'i': { duration: Math.max(0.0, 8.0 + adjustment), remaining: 0 },
      'j': { duration: Math.max(0.0, 1.0 + adjustment), remaining: 0 }
    };
    
    this.globalCooldown = 0;
    this.globalCooldownDuration = 0.3;
    
    // HEALTH SYSTEM
    this.maxHealth = 1000;
    this.health = 1000;
    this.isDead = false;
    this.isHit = false;
    this.isAttacking = false;
    this.team = 'player';
    
    // Configure projectiles for each attack key
    this.attackProjectileConfigs = attackProjectileConfigs || {
      'p': {
        pattern: 'triple',
        speed: this.baseAttackSpeed + 120,
        offsetY: 18,
        scale: 10,
        damage: 50,
        modelPath: powerP,
        loadModel: loadModel
      },
      'l': {
        pattern: 'circle',
        count: 25,
        speed: this.baseAttackSpeed + 60,
        spreadAngle: 0.05,
        offsetY: 10,
        scale: 1.5,
        damage: 80,
        modelPath: powerL,
        loadModel: loadModel
      },
      'o': {
        pattern: 'single',
        speed: this.baseAttackSpeed + 100,
        offsetY: 10,
        scale: 5,
        damage: 50,
        modelPath: powerO,
        loadModel: loadModel
      },
      'k': {
        pattern: 'single',
        speed: this.baseAttackSpeed + 500,
        offsetY: 10,
        scale: 8,
        damage: 80,
        modelPath: powerK,
        loadModel: loadModel
      },
      'i': {
        pattern: 'spread',
        spreadAngle: 0.25,
        count: 6,
        speed: this.baseAttackSpeed + 30,
        offsetY: 15,
        scale: 2,
        damage: 100,
        modelPath: powerI,
        loadModel: loadModel
      },
      'j': {
        pattern: 'single',
        speed: this.baseAttackSpeed + 80,
        offsetY: 15,
        scale: 5,
        damage: 40,
        modelPath: powerJ,
        loadModel: loadModel
      }
    };
    
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
    this.collider = world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    this.loadPromise = this.initModel(position, scene, mixers);
  }
  
  async initModel(initialPosition, scene, mixers) {
    try {
      const scale = 0.05;
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await this.modelLoader(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
      this.mixer = new THREE.AnimationMixer(this.model);
      mixers.push(this.mixer);
      
      const idleClip = await this.animationLoader(heroIdle);
      this.actions.idle = this.mixer.clipAction(idleClip);
      this.actions.idle.play();
      this.currentAction = this.actions.idle;
      
      const walkClip = await this.animationLoader(heroWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.6;
      
      const runClip = await this.animationLoader(heroRun);
      this.actions.run = this.mixer.clipAction(runClip);
      this.actions.run.timeScale = 0.6;
      
      const hitClip = await this.animationLoader(heroAttacked);
      this.actions.hit = this.mixer.clipAction(hitClip);
      this.actions.hit.setLoop(THREE.LoopOnce);
      this.actions.hit.clampWhenFinished = true;
      
      const dyingClip = await this.animationLoader(heroDying);
      this.actions.dying = this.mixer.clipAction(dyingClip);
      this.actions.dying.setLoop(THREE.LoopOnce);
      this.actions.dying.clampWhenFinished = true;
      
      const attackMap = {
        p: heroHitP,
        l: heroHitL,
        o: heroHitO,
        k: heroHitK,
        i: heroHitI,
        j: heroHitJ
      };

      for (const [key, path] of Object.entries(attackMap)) {
        const clip = await this.animationLoader(path);
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        this.attacks[key] = action;
      }

      this.mixer.addEventListener('finished', (e) => {
        const finishedAction = e.action;
        
        if (Object.values(this.attacks).includes(finishedAction)) {
          this.isAttacking = false;
          finishedAction.fadeOut(0.3);
          this.actions.idle.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.idle;
        }
        
        if (finishedAction === this.actions.hit) {
          this.isHit = false;
          finishedAction.fadeOut(0.2);
          this.actions.idle.reset().fadeIn(0.2).play();
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
  
  toggleControlMode() {
    this.controlMode = this.controlMode === 'keyboard' ? 'orbit' : 'keyboard';
    console.log(`Control mode switched to: ${this.controlMode}`);
    return this.controlMode;
  }
  
  takeDamage(amount) {
    if (this.isDead || this.isHit) return;
    
    this.health -= amount;
    console.log(`Player took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);
    
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    } else {
      this.playHitAnimation();
    }
  }
  
  playHitAnimation() {
    if (!this.actions.hit || this.isHit || this.isDead) return;
    
    this.isHit = true;
    if (this.currentAction) this.currentAction.fadeOut(0.1);
    this.actions.hit.reset().fadeIn(0.1).play();
    this.currentAction = this.actions.hit;
  }
  
  die() {
    if (this.isDead) return;
    
    this.isDead = true;
    this.isHit = false;
    this.isAttacking = false;
    console.log('Player died!');
    
    this.rigidBody.setLinvel({ x: 0, y: this.rigidBody.linvel().y, z: 0 }, true);
    
    if (this.actions.dying) {
      if (this.currentAction) this.currentAction.stop();
      this.actions.dying.reset().play();
      this.currentAction = this.actions.dying;
    }
  }
  
  fireProjectiles(attackKey) {
    const config = this.attackProjectileConfigs[attackKey];
    if (!config) return;
    
    const physicsPos = this.rigidBody.translation();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    forward.y = 0;
    forward.normalize();
    
    if (config.pattern === 'custom' && config.customPattern) {
      config.customPattern(this, physicsPos, forward);
      return;
    }
    
    const projectileDirections = this.getProjectileDirections(forward, config.pattern, config.count || 1, config.spreadAngle || 0.3);
    
    projectileDirections.forEach(direction => {
      const startPosition = new THREE.Vector3(
        physicsPos.x,
        physicsPos.y + (config.offsetY || 10),
        physicsPos.z
      );
      
      const projectileOptions = {
        world: this.world,
        scene: this.scene,
        color: config.color || 0xff0000,
        speed: config.speed || 20,
        scale: config.scale || 1,
        damage: config.damage || 50,
        team: 'player'
      };
      
      if (config.modelPath && config.loadModel) {
        projectileOptions.modelPath = config.modelPath;
        projectileOptions.loadModel = config.loadModel;
        projectileOptions.scale = config.scale;
      } else if (config.modelPath && this.modelLoader) {
        projectileOptions.modelPath = config.modelPath;
        projectileOptions.loadModel = this.modelLoader;
        projectileOptions.scale = config.scale;
      }
      
      const projectile = new Projectile(
        { position: startPosition, direction: direction },
        projectileOptions
      );
      this.projectiles.push(projectile);
    });
  }
  
  getProjectileDirections(baseDirection, pattern, count, spreadAngle) {
    const directions = [];
    
    switch (pattern) {
      case 'single':
        directions.push(baseDirection.clone());
        break;
        
      case 'triple':
        directions.push(baseDirection.clone());
        directions.push(baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spreadAngle));
        directions.push(baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -spreadAngle));
        break;
        
      case 'spread':
        const totalSpread = spreadAngle * 2;
        for (let i = 0; i < count; i++) {
          const angle = -spreadAngle + (totalSpread / (count - 1)) * i;
          directions.push(baseDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle));
        }
        break;
        
      case 'circle':
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
          directions.push(direction);
        }
        break;
        
      default:
        directions.push(baseDirection.clone());
    }
    
    return directions;
  }
  
  update(delta) {
    if (this.isDead) return;
    
    if (this.globalCooldown > 0) {
      this.globalCooldown -= delta;
    }
      
    for (const key in this.attackCooldowns) {
      if (this.attackCooldowns[key].remaining > 0) {
        this.attackCooldowns[key].remaining -= delta;
      }
    }
    
    if (this.mixer && this.actions.idle && this.actions.walk && this.actions.run) {
      const isAttacking = this.currentAction && Object.values(this.attacks).includes(this.currentAction);
      
      if (this.isHit) {
        this.mixer.update(delta);
        return;
      }
      
      if (!isAttacking) {
        if (this.isMoving) {
          const targetAction = this.isRunning ? this.actions.run : this.actions.walk;
          if (this.currentAction !== targetAction) {
            if (this.currentAction) this.currentAction.fadeOut(0.3);
            targetAction.reset().fadeIn(0.3).play();
            this.currentAction = targetAction;
          }
        } else if (this.currentAction !== this.actions.idle) {
          if (this.currentAction) this.currentAction.fadeOut(0.3);
          this.actions.idle.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.idle;
        }
      }
      this.mixer.update(delta);
    }
  }
  
  handleInput(keys, delta) {
    if (this.isDead || this.isHit) return;
    
    const velocity = new THREE.Vector3();
    let rotationInput = 0;
    
    if (this.controlMode === 'keyboard') {
      // Original keyboard controls (Arrow keys)
      if (keys.ArrowUp) velocity.z = 1;
      if (keys.ArrowDown) velocity.z = -1;
      if (keys.ArrowLeft) rotationInput += 1;
      if (keys.ArrowRight) rotationInput -= 1;
      
      // WASD controls
      if (keys.w) velocity.z = 1;
      if (keys.s) velocity.z = -1;
      if (keys.a) rotationInput += 1;
      if (keys.d) rotationInput -= 1;
      
    } else if (this.controlMode === 'orbit') {
      // Orbit mode: WASD movement relative to camera
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0;
      cameraDirection.normalize();
      
      const cameraRight = new THREE.Vector3();
      cameraRight.crossVectors(this.camera.up, cameraDirection).normalize();
      
      const moveDirection = new THREE.Vector3();
      
      if (keys.w || keys.ArrowUp) moveDirection.add(cameraDirection);
      if (keys.s || keys.ArrowDown) moveDirection.sub(cameraDirection);
      if (keys.a || keys.ArrowLeft) moveDirection.add(cameraRight);
      if (keys.d || keys.ArrowRight) moveDirection.sub(cameraRight);
      
      if (moveDirection.length() > 0) {
        moveDirection.normalize();
        velocity.copy(moveDirection);
        
        // Auto-rotate player to face movement direction
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        this.targetRotation = targetAngle;
      }
    }
    
    this.isMoving = velocity.length() > 0 || rotationInput !== 0;
    this.isRunning = keys.Shift && this.isMoving;
    this.moveForce = this.isRunning ? this.baseMoveForce + 10 : this.baseMoveForce;
    
    // Handle Attack Keys with Individual Cooldowns
    if (this.globalCooldown <= 0) {
      const attackKeyMap = { 'p': 'p', 'l': 'l', 'o': 'o', 'k': 'k', 'i': 'i', 'j': 'j' };
      let triggeredAttack = null;
      let attackKey = null;
  
      for (const [inputKey, key] of Object.entries(attackKeyMap)) {
        if (keys[inputKey] && 
            this.attacks[key] && 
            this.attackCooldowns[key].remaining <= 0) {
          triggeredAttack = this.attacks[key];
          attackKey = key;
          break;
        }
      }
  
      if (triggeredAttack && this.currentAction !== triggeredAttack) {
        if (this.currentAction) this.currentAction.fadeOut(0.3);
        triggeredAttack.reset().fadeIn(0.3).play();
        this.currentAction = triggeredAttack;
        
        this.fireProjectiles(attackKey);
        
        this.globalCooldown = this.globalCooldownDuration;
        this.attackCooldowns[attackKey].remaining = this.attackCooldowns[attackKey].duration;
      }
    }
    
    // Rotation
    if (rotationInput !== 0) {
      this.targetRotation += rotationInput * delta * 4;
    }
    
    const rotationDiff = this.targetRotation - this.currentRotation;
    const normalizedDiff = ((rotationDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    this.currentRotation += normalizedDiff * this.rotationSpeed;
    this.entity.rotation.fromEuler(0, this.currentRotation, 0);
    
    // Movement
    if (velocity.length() > 0) {
      if (this.controlMode === 'keyboard') {
        velocity.applyQuaternion(this.entity.rotation);
      }
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