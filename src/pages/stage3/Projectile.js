import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

export class Projectile {
  constructor({ position, direction }, { world, scene, color = 0xff0000, modelPath = null, loadModel = null, scale = 1, speed = 30, maxDistance = 80, colliderRadius = 0.8, rotation = null, damage = 50, team = 'neutral', lifetime = 5.0 }) {
    this.world = world;
    this.scene = scene;
    this.mesh = null;
    this.isModelLoaded = false;
    this.maxDistance = maxDistance;
    this.speed = speed;
    this.direction = direction.clone().normalize();
    this.damage = damage;
    this.team = team;
    this.hasHit = false;
    this.spawnTime = performance.now();
    this.lifetime = lifetime;
    this.scale = scale; // Store scale for collision radius calculation
    
    // Calculate effective collision radius based on scale
    this.effectiveCollisionRadius = colliderRadius * Math.max(1, scale * 0.15);
    
    // Debug sphere (optional - set to true to visualize collision bounds)
    this.debugMode = false;
    this.debugSphere = null;
    
    try {
      // Setup physics first with CCD (Continuous Collision Detection) for fast projectiles
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.0)
        .setCcdEnabled(true); // CRITICAL: Enable CCD to prevent tunneling
      this.rigidBody = world.createRigidBody(bodyDesc);
      
      // Use the effective collision radius
      const colliderDesc = RAPIER.ColliderDesc.ball(this.effectiveCollisionRadius)
        .setSensor(true); // Make it a sensor so it doesn't physically collide but still detects
      this.collider = world.createCollider(colliderDesc, this.rigidBody);
      
      const impulse = { x: this.direction.x * speed, y: 0, z: this.direction.z * speed };
      this.rigidBody.applyImpulse(impulse, true);
      
      this.startPosition = position.clone();
      
      // Create debug visualization if enabled
      if (this.debugMode) {
        const debugGeometry = new THREE.SphereGeometry(this.effectiveCollisionRadius, 8, 8);
        const debugMaterial = new THREE.MeshBasicMaterial({ 
          color: team === 'player' ? 0x00ff00 : 0xff0000,
          wireframe: true,
          transparent: true,
          opacity: 0.3
        });
        this.debugSphere = new THREE.Mesh(debugGeometry, debugMaterial);
        scene.add(this.debugSphere);
      }
      
      // If model path provided, load model asynchronously
      if (modelPath && loadModel) {
        this.loadProjectileModel(modelPath, loadModel, position, scale, rotation);
      } else {
        // Default sphere projectile
        const geometry = new THREE.SphereGeometry(colliderRadius, 16, 16);
        const material = new THREE.MeshStandardMaterial({ 
          color: color,
          emissive: color,
          emissiveIntensity: 0.3
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        
        if (scene) {
          scene.add(this.mesh);
          this.mesh.position.set(position.x, position.y, position.z);
        } else {
          throw new Error('Scene is undefined');
        }
        this.isModelLoaded = true;
      }
    } catch (error) {
      console.error('Failed to initialize projectile:', error);
    }
  }
  
  async loadProjectileModel(modelPath, loadModel, position, scale, customRotation) {
    try {
      // Calculate rotation to face direction
      const angle = Math.atan2(this.direction.x, this.direction.z);
      const rotation = customRotation || new THREE.Euler(0, angle, 0);
      
      // IMPORTANT: Clone from cache if available, otherwise load fresh
      let model;
      if (window.projectileModelCache && window.projectileModelCache.has(modelPath)) {
        // Clone the cached model
        const cachedModel = window.projectileModelCache.get(modelPath);
        model = cachedModel.clone(true); // Deep clone with materials
        
        // Apply transformations
        model.scale.set(scale, scale, scale);
        model.rotation.copy(rotation);
        model.position.copy(position);
        
        // Ensure shadows are enabled on cloned model
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        this.scene.add(model);
        this.mesh = model;
        this.isModelLoaded = true;
      } else {
        // Fallback to regular loading if not cached
        this.mesh = await loadModel(modelPath, scale, rotation, position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.isModelLoaded = true;
      }
      
      // Update initial position from physics
      const physicsPos = this.rigidBody.translation();
      this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    } catch (error) {
      console.error('Failed to load projectile model:', error);
      // Fallback to sphere if model fails
      const geometry = new THREE.SphereGeometry(0.5, 16, 16);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
      });
      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.castShadow = true;
      this.scene.add(this.mesh);
      
      const physicsPos = this.rigidBody.translation();
      this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
      this.isModelLoaded = true;
    }
  }
  
  checkCollision(player, enemies) {
    if (this.hasHit) return false;
    
    const projectilePos = this.rigidBody.translation();
    
    // Check collision with player (if projectile is from enemy)
    if (this.team === 'enemy' && player && !player.isDead) {
      const playerPos = player.rigidBody.translation();
      
      // FIXED: Only check horizontal (XZ plane) distance, ignore Y
      // This prevents projectiles from missing due to height differences
      const distanceXZ = Math.sqrt(
        Math.pow(projectilePos.x - playerPos.x, 2) +
        Math.pow(projectilePos.z - playerPos.z, 2)
      );
      
      // Check Y distance separately with more lenient bounds
      const distanceY = Math.abs(projectilePos.y - playerPos.y);
      
      // Player collision: 3 units horizontal, 5 units vertical tolerance
      const horizontalRange = 3.0 + this.effectiveCollisionRadius;
      const verticalRange = 5.0;
      
      if (distanceXZ < horizontalRange && distanceY < verticalRange) {
        console.log(`🎯 Player HIT by ${this.team} projectile! Distance: ${distanceXZ.toFixed(2)}, Damage: ${this.damage}`);
        player.takeDamage(this.damage);
        this.hasHit = true;
        return true;
      }
    }
    
    // Check collision with enemies (if projectile is from player)
    if (this.team === 'player' && enemies) {
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        
        const enemyPos = enemy.rigidBody.translation();
        
        // FIXED: Only check horizontal (XZ plane) distance
        const distanceXZ = Math.sqrt(
          Math.pow(projectilePos.x - enemyPos.x, 2) +
          Math.pow(projectilePos.z - enemyPos.z, 2)
        );
        
        // Check Y distance separately
        const distanceY = Math.abs(projectilePos.y - enemyPos.y);
        
        // Enemy collision: 5 units horizontal (larger hitbox), 8 units vertical
        const horizontalRange = 5.0 + this.effectiveCollisionRadius;
        const verticalRange = 8.0;
        
        if (distanceXZ < horizontalRange && distanceY < verticalRange) {
          console.log(`🎯 Enemy HIT by ${this.team} projectile! Distance: ${distanceXZ.toFixed(2)}, Damage: ${this.damage}`);
          enemy.takeDamage(this.damage);
          this.hasHit = true;
          return true;
        }
      }
    }
    
    return false;
  }
  
  update(player = null, enemies = []) {
    try {
      // === EXPIRY CHECK (ROLE-BASED LIFETIME) ===
      if (performance.now() - this.spawnTime > this.lifetime * 1000) {
        return true; // Auto-remove after lifetime
      }

      // Check for collisions BEFORE updating position (prevent skipping frames)
      if (this.checkCollision(player, enemies)) {
        return true; // Dispose projectile
      }
      
      // Only update position if model is loaded
      if (this.isModelLoaded && this.mesh) {
        const physicsPos = this.rigidBody.translation();
        this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
        
        // Update debug sphere position if enabled
        if (this.debugMode && this.debugSphere) {
          this.debugSphere.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
        }
        
        // Optional: Rotate model to face direction of travel
        const velocity = this.rigidBody.linvel();
        if (velocity.x !== 0 || velocity.z !== 0) {
          const angle = Math.atan2(velocity.x, velocity.z);
          this.mesh.rotation.y = angle;
        }
        
        const distance = this.startPosition.distanceTo(new THREE.Vector3(physicsPos.x, physicsPos.y, physicsPos.z));
        if (distance >= this.maxDistance) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Projectile update failed:', error);
      return true; // Dispose on error to prevent crashes
    }
  }
  
  dispose() {
    try {
      if (this.scene && this.mesh) {
        this.scene.remove(this.mesh);
        
        // Properly dispose of geometry and materials
        this.mesh.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
      
      // Remove debug sphere if exists
      if (this.debugMode && this.debugSphere) {
        this.scene.remove(this.debugSphere);
        if (this.debugSphere.geometry) this.debugSphere.geometry.dispose();
        if (this.debugSphere.material) this.debugSphere.material.dispose();
      }
      
      if (this.world && this.rigidBody) {
        this.world.removeRigidBody(this.rigidBody);
      }
    } catch (error) {
      console.error('Projectile dispose failed:', error);
    }
  }
}