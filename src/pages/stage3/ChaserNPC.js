import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';
import { Projectile } from './Projectile.js';

import witchWalk from "../../../public/models/witch/Mutant Walking.fbx";
import witchIdle from "../../../public/models/witch/witch_Idle.fbx";
import witchAttack1 from "../../../public/models/witch/Zombie Attack.fbx";
import witchAttack2 from "../../../public/models/witch/Standing Melee Attack Downward.fbx";
import witchAttack3 from "../../../public/models/witch/Mutant Swiping.fbx";
import witchAttack4 from "../../../public/models/witch/Standing Melee Attack Horizontal.fbx";
import witchAttack5 from "../../../public/models/witch/Mutant Punch.fbx";
import witchAttack6 from "../../../public/models/witch/Sword And Shield Casting.fbx";
import witchHit from "../../../public/models/witch/Zombie Reaction Hit.fbx";
import witchDying from "../../../public/models/witch/Zombie Dying.fbx";
import witchPowerup from "../../../public/models/witch/Standing Taunt Battlecry.fbx";

import power1 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power2 from "../../../public/models/projectiles/blood_moon_grin.glb";
import power3 from "../../../public/models/projectiles/packwar_blood_edition.glb";
import power4 from "../../../public/models/projectiles/graveyard_fog_eyeball_-_blender_file.glb";
import power5 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";
import power6 from "../../../public/models/projectiles/flying_crow_-_blacksmiths_workshop_assets.glb";

export class ChaserNPC {
  constructor({ 
    position, 
    modelPath, 
    maxSpeed, 
    stopDistance, 
    target, 
    world, 
    scene, 
    mixers, 
    entityManager, 
    loadModel, 
    loadAnimation, 
    projectiles,
    attackProjectileConfigs = null
  }) {
    this.stopDistance = stopDistance;
    this.target = target;
    this.model = null;
    this.mixer = null;
    this.world = world;
    this.scene = scene;
    this.projectiles = projectiles;
    this.modelLoader = loadModel;
    this.animationLoader = loadAnimation;
    this.actions = { idle: null, walk: null, hit: null, dying: null, powerup: null };
    this.attacks = [];
    this.currentAction = null;
    this.attackCooldown = 1;
    this.cooldownDuration = 1;
    
    // HEALTH SYSTEM
    this.maxHealth = 1000;
    this.health = 1000;
    this.isDead = false;
    this.isHit = false; // Track if currently playing hit animation
    this.team = 'enemy'; // Used for collision detection
    
    // Configure projectiles for each attack (6 attacks total)
    this.attackProjectileConfigs = attackProjectileConfigs || {
      0: { // Attack 1 - Single purple
        pattern: 'single',
        color: 0x9d00ff,
        speed: 20,
        offsetY: 15,
        scale: 1,
        damage: 40
      },
      1: { // Attack 2 - Triple dark
        pattern: 'triple',
        color: 0x6600cc,
        speed: 22,
        spreadAngle: 0.4,
        offsetY: 15,
        scale: 1,
        damage: 30
      },
      2: { // Attack 3 - Fast single
        pattern: 'single',
        color: 0xaa00ff,
        speed: 25,
        offsetY: 15,
        scale: 1.2,
        damage: 50
      },
      3: { // Attack 4 - Spread
        pattern: 'spread',
        count: 5,
        color: 0x8800dd,
        speed: 18,
        spreadAngle: 0.5,
        offsetY: 15,
        scale: 1,
        damage: 25
      },
      4: { // Attack 5 - Circle burst
        pattern: 'circle',
        count: 8,
        color: 0xbb00ff,
        speed: 20,
        offsetY: 15,
        scale: 1,
        damage: 20
      },
      5: { // Attack 6 - Powerful single
        pattern: 'single',
        color: 0xff00ff,
        speed: 30,
        offsetY: 15,
        scale: 2,
        damage: 80
      }
    };
    
    // Debug indicator
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
    
    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.5)
      .setAngularDamping(2.0);
    this.rigidBody = world.createRigidBody(bodyDesc);
    
    const colliderDesc = RAPIER.ColliderDesc.cuboid(1.8, 3.5, 1.8);
    this.collider = world.createCollider(colliderDesc, this.rigidBody);
    this.rigidBody.setEnabledRotations(false, false, false, true);
    
    entityManager.add(this.entity);
    
    // Start async model loading
    this.loadPromise = this.initModel(position, scene, mixers);
  }
  
  async initModel(initialPosition, scene, mixers) {
    try {
      const scale = 10;
      const rotation = new THREE.Euler(0, Math.PI, 0);
      this.model = await this.modelLoader(witchIdle, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
      
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
      const walkClip = await this.animationLoader(witchWalk);
      this.actions.walk = this.mixer.clipAction(walkClip);
      this.actions.walk.timeScale = 0.8;
      
      // Load hit animation
      const hitClip = await this.animationLoader(witchHit);
      this.actions.hit = this.mixer.clipAction(hitClip);
      this.actions.hit.setLoop(THREE.LoopOnce);
      this.actions.hit.clampWhenFinished = true;
      
      // Load death animation
      const dyingClip = await this.animationLoader(witchDying);
      this.actions.dying = this.mixer.clipAction(dyingClip);
      this.actions.dying.setLoop(THREE.LoopOnce);
      this.actions.dying.clampWhenFinished = true;
      
      // Load powerup animation (for when player dies)
      const powerupClip = await this.animationLoader(witchPowerup);
      this.actions.powerup = this.mixer.clipAction(powerupClip);
      this.actions.powerup.setLoop(THREE.LoopOnce);
      this.actions.powerup.clampWhenFinished = true;
      
      // Load all 6 attack animations
      const attackPaths = [
        witchAttack1,
        witchAttack2,
        witchAttack3,
        witchAttack4,
        witchAttack5,
        witchAttack6
      ];

      for (const path of attackPaths) {
        const clip = await this.animationLoader(path);
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        this.attacks.push(action);
      }
      
      // Animation finish handler for attacks
      this.mixer.addEventListener('finished', (e) => {
        const finishedAction = e.action;
        
        // Handle attack animations
        if (this.attacks.includes(finishedAction)) {
          finishedAction.fadeOut(0.2);
          this.actions.idle.reset().fadeIn(0.2).play();
          this.currentAction = this.actions.idle;
          this.attackCooldown = this.cooldownDuration;
        }
        
        // Handle hit animation
        if (finishedAction === this.actions.hit) {
          this.isHit = false;
          finishedAction.fadeOut(0.2);
          this.actions.idle.reset().fadeIn(0.2).play();
          this.currentAction = this.actions.idle;
        }
      });
      
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
    console.log(`Witch took ${amount} damage! Health: ${this.health}/${this.maxHealth}`);
    
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
    console.log('Witch died!');
    
    // Stop all movement
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    
    // Remove seek behavior to stop following player
    this.entity.steering.remove(this.seekBehavior);
    
    // Play death animation - will freeze at last frame due to clampWhenFinished
    if (this.actions.dying) {
      if (this.currentAction) this.currentAction.stop();
      this.actions.dying.reset().play();
      this.currentAction = this.actions.dying;
    }
  }
  
  playVictoryAnimation() {
    if (!this.actions.powerup || this.isDead) return;
    
    // Stop movement
    this.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    
    // Remove seek behavior to stop following
    this.entity.steering.remove(this.seekBehavior);
    
    // Play powerup/victory animation - will freeze at last frame due to clampWhenFinished
    if (this.currentAction) this.currentAction.stop();
    this.actions.powerup.reset().play();
    this.currentAction = this.actions.powerup;
  }
  
  updateIndicator() {
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
    const physicsPos = this.rigidBody.translation();
    this.indicator.position.copy(physicsPos).add(forward.multiplyScalar(3));
    this.indicator.position.y = physicsPos.y + 3.5;
  }
  
  fireProjectiles(attackIndex) {
    const config = this.attackProjectileConfigs[attackIndex];
    if (!config) return;
    
    const physicsPos = this.rigidBody.translation();
    
    // Calculate base direction towards target
    const baseDirection = new THREE.Vector3(
      this.target.entity.position.x - physicsPos.x,
      0,
      this.target.entity.position.z - physicsPos.z
    ).normalize();
    
    // Custom pattern function
    if (config.pattern === 'custom' && config.customPattern) {
      config.customPattern(this, physicsPos, baseDirection);
      return;
    }
    
    // Predefined patterns
    const projectileDirections = this.getProjectileDirections(baseDirection, config.pattern, config.count || 1, config.spreadAngle || 0.3);
    
    projectileDirections.forEach(direction => {
      const startPosition = new THREE.Vector3(
        physicsPos.x, 
        physicsPos.y + (config.offsetY || 15), 
        physicsPos.z
      );
      
      const projectileOptions = {
        world: this.world,
        scene: this.scene,
        color: config.color || 0x9d00ff,
        speed: config.speed || 20,
        damage: config.damage || 40, // Pass damage to projectile
        team: 'enemy' // Team identification
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
    if (this.isDead) return;
    
    const physicsPos = this.rigidBody.translation();
    this.entity.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    this.seekBehavior.target.copy(this.target.entity.position);

    // Don't move or attack during hit animation
    if (this.isHit) {
      const stopVel = { x: this.rigidBody.linvel().x * 0.85, y: this.rigidBody.linvel().y, z: this.rigidBody.linvel().z * 0.85 };
      this.rigidBody.setLinvel(stopVel, true);
      if (this.mixer) this.mixer.update(delta);
      return;
    }

    const distanceToTarget = this.entity.position.distanceTo(this.target.entity.position);
    const velocity = this.entity.velocity;
    const currentVel = this.rigidBody.linvel();

    if (distanceToTarget > this.stopDistance && velocity.length() > 0) {
      // CHASING BEHAVIOR
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

      if (velocity.length() > 0) {
        const targetYRotation = Math.atan2(velocity.x, velocity.z);
        this.entity.rotation.set(0, targetYRotation, 0);
      }

      if (this.mixer && this.actions.walk && this.currentAction !== this.actions.walk) {
        if (this.actions.idle) this.actions.idle.fadeOut(0.2);
        this.actions.walk.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.walk;
      }
    } else {
      // IN RANGE: COMBAT BEHAVIOR
      const stopVel = { x: currentVel.x * 0.85, y: currentVel.y, z: currentVel.z * 0.85 };
      this.rigidBody.setLinvel(stopVel, true);

      // Face the target
      const directionToTarget = new THREE.Vector3(
        this.target.entity.position.x - physicsPos.x,
        0,
        this.target.entity.position.z - physicsPos.z
      );
      if (directionToTarget.length() > 0) {
        const targetYRotation = Math.atan2(directionToTarget.x, directionToTarget.z);
        this.entity.rotation.set(0, targetYRotation, 0);
      }

      this.attackCooldown -= delta;
      const isAttacking = this.currentAction && this.attacks.includes(this.currentAction);

      // TRIGGER NEXT ATTACK
      if (this.attackCooldown <= 0 && !isAttacking) {
        const attackIndex = Math.floor(Math.random() * this.attacks.length);
        const selectedAction = this.attacks[attackIndex];

        if (this.currentAction !== selectedAction) {
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          selectedAction.reset().fadeIn(0.2).play();
          this.currentAction = selectedAction;
          
          // Fire projectiles immediately when attack starts
          this.fireProjectiles(attackIndex);
        }
      }
      // RETURN TO IDLE IF NOT ATTACKING
      else if (!isAttacking && this.currentAction !== this.actions.idle) {
        if (this.actions.walk) this.actions.walk.fadeOut(0.2);
        this.actions.idle.reset().fadeIn(0.2).play();
        this.currentAction = this.actions.idle;
      }
    }

    // DEBUG INDICATOR
    if (this.indicator && this.model) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.entity.rotation);
      const headPos = new THREE.Vector3();
      this.model.getWorldPosition(headPos);
      headPos.y += 4;
      this.indicator.position.copy(headPos).add(forward.multiplyScalar(1));
      this.indicator.visible = true;
    }
  }
}