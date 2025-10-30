import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { Projectile } from './Projectile.js';

import hero from "../../../public/models/cop/Magic Spell Pack/Undercover_Cop_-_Animated.fbx";
import heroDying from "../../../public/models/cop/Magic Spell Pack/Standing React Death Backward.fbx";
import heroAttacked from "../../../public/models/cop/Magic Spell Pack/Standing React Small From Left.fbx";
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

export class Player {
  constructor({ position, modelPath, maxSpeed, moveForce, world, scene, mixers, entityManager, loadModel, loadAnimation, projectiles, attackProjectileConfigs = null }) {
    this.baseMoveForce = moveForce;
    this.moveForce = moveForce;
    this.modelPath = modelPath;
    this.isMoving = false;
    this.isRunning = false;
    this.mixer = null;
    this.actions = { idle: null, walk: null, run: null, hit: null, dying: null };
    this.attacks = {}; // Will hold: p, l, o, k, i, j
    this.currentAction = null;
    this.world = world;
    this.scene = scene;
    this.projectiles = projectiles;
    this.targetRotation = 0;
    this.currentRotation = 0;
    this.rotationSpeed = 0.05;
    this.modelLoader = loadModel;
    this.animationLoader = loadAnimation;
    
    // HEALTH SYSTEM
    this.maxHealth = 1000;
    this.health = 1000;
    this.isDead = false;
    this.isHit = false; // Track if currently playing hit animation
    this.isAttacking = false; // Track if currently playing attack animation
    this.team = 'player'; // Used for collision detection
    
    // Configure projectiles for each attack key
    this.attackProjectileConfigs = attackProjectileConfigs || {
      'p': {
        pattern: 'single',
        color: 0xff0000,
        speed: 25,
        offsetY: 15,
        scale: 1,
        damage: 50 // Damage amount
      },
      'l': {
        pattern: 'triple',
        color: 0x00ff00,
        speed: 20,
        spreadAngle: 0.4,
        offsetY: 15,
        scale: 1,
        damage: 30
      },
      'o': {
        pattern: 'single',
        color: 0x0000ff,
        speed: 30,
        offsetY: 15,
        scale: 1.5,
        damage: 80
      },
      'k': {
        pattern: 'spread',
        count: 5,
        color: 0xffff00,
        speed: 22,
        spreadAngle: 0.5,
        offsetY: 15,
        scale: 1,
        damage: 25
      },
      'i': {
        pattern: 'circle',
        count: 8,
        color: 0xff00ff,
        speed: 18,
        offsetY: 15,
        scale: 1,
        damage: 20
      },
      'j': {
        pattern: 'single',
        color: 0x00ffff,
        speed: 35,
        offsetY: 15,
        scale: 2,
        damage: 100
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
      
      // === Load Base Animations ===
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
      
      // === Load Hit Animation ===
      const hitClip = await this.animationLoader(heroAttacked);
      this.actions.hit = this.mixer.clipAction(hitClip);
      this.actions.hit.setLoop(THREE.LoopOnce);
      this.actions.hit.clampWhenFinished = true;
      
      // === Load Death Animation ===
      const dyingClip = await this.animationLoader(heroDying);
      this.actions.dying = this.mixer.clipAction(dyingClip);
      this.actions.dying.setLoop(THREE.LoopOnce);
      this.actions.dying.clampWhenFinished = true;
      
      // === Load All Attack Animations ===
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

      // === Animation Finish Handler ===
      this.mixer.addEventListener('finished', (e) => {
        const finishedAction = e.action;
        
        // Handle attack animations
        if (Object.values(this.attacks).includes(finishedAction)) {
          this.isAttacking = false; // Allow next attack
          finishedAction.fadeOut(0.3);
          this.actions.idle.reset().fadeIn(0.3).play();
          this.currentAction = this.actions.idle;
        }
        
        // Handle hit animation - return to idle
        if (finishedAction === this.actions.hit) {
          this.isHit = false;
          finishedAction.fadeOut(0.2);
          this.actions.idle.reset().fadeIn(0.2).play();
          this.currentAction = this.actions.idle;
        }
        
        // Death animation stays frozen at last frame (clampWhenFinished handles this)
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
  
  takeDamage(amount) {
    if (this.isDead || this.isHit) return;
    
    this.health -= amount;
    console.log(`Player took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);
    
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    } else {
      // Play hit animation if not dead
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
    this.isHit = false; // Clear hit flag if dying
    this.isAttacking = false; // Clear attacking flag
    console.log('Player died!');
    
    // Stop movement
    this.rigidBody.setLinvel({ x: 0, y: this.rigidBody.linvel().y, z: 0 }, true);
    
    // Play death animation - will freeze at last frame due to clampWhenFinished
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
    
    // Custom pattern function
    if (config.pattern === 'custom' && config.customPattern) {
      config.customPattern(this, physicsPos, forward);
      return;
    }
    
    // Get projectile directions based on pattern
    const projectileDirections = this.getProjectileDirections(forward, config.pattern, config.count || 1, config.spreadAngle || 0.3);
    
    projectileDirections.forEach(direction => {
      const startPosition = new THREE.Vector3(
        physicsPos.x,
        physicsPos.y + (config.offsetY || 15),
        physicsPos.z
      );
      
      const projectileOptions = {
        world: this.world,
        scene: this.scene,
        color: config.color || 0xff0000,
        speed: config.speed || 20,
        scale: config.scale || 1,
        damage: config.damage || 50, // Pass damage to projectile
        team: 'player' // Team identification
      };
      
      // Add model parameters if model path is provided
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
    if (this.mixer) {
      // Always update mixer to allow animations to play
      this.mixer.update(delta);
    }
    
    // Don't update movement logic if dead, hit, or attacking
    if (this.isDead || this.isHit || this.isAttacking) return;
    
    if (this.actions.idle && this.actions.walk && this.actions.run) {
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
  }
  
  handleInput(keys, delta) {
    if (this.isDead || this.isHit || this.isAttacking) return; // Can't control during hit, death, or attack
    
    const velocity = new THREE.Vector3();
    let rotationInput = 0;
    
    if (keys.ArrowUp) velocity.z = 1;
    if (keys.ArrowDown) velocity.z = -1;
    if (keys.ArrowLeft) rotationInput += 1;
    if (keys.ArrowRight) rotationInput -= 1;
    
    this.isMoving = velocity.length() > 0 || rotationInput !== 0;
    this.isRunning = keys.Shift && this.isMoving;
    this.moveForce = this.isRunning ? this.baseMoveForce + 10 : this.baseMoveForce;
    
    // === Handle Attack Keys ===
    const attackKeyMap = { 'p': 'p', 'l': 'l', 'o': 'o', 'k': 'k', 'i': 'i', 'j': 'j' };
    let triggeredAttack = null;
    let attackKey = null;

    for (const [inputKey, key] of Object.entries(attackKeyMap)) {
      if (keys[inputKey] && this.attacks[key]) {
        triggeredAttack = this.attacks[key];
        attackKey = key;
        break; // First pressed key wins
      }
    }

    if (triggeredAttack && this.currentAction !== triggeredAttack) {
      if (this.currentAction) this.currentAction.fadeOut(0.3);
      triggeredAttack.reset().fadeIn(0.3).play();
      this.currentAction = triggeredAttack;
      
      // Fire projectiles immediately when attack starts
      this.fireProjectiles(attackKey);
    }
    
    // === Rotation ===
    if (rotationInput !== 0) {
      this.targetRotation += rotationInput * delta * 4;
    }
    
    const rotationDiff = this.targetRotation - this.currentRotation;
    const normalizedDiff = ((rotationDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    this.currentRotation += normalizedDiff * this.rotationSpeed;
    this.entity.rotation.fromEuler(0, this.currentRotation, 0);
    
    // === Movement ===
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