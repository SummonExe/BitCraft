import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

export class Projectile {
  constructor({ position, direction }, { world, scene, color = 0xff0000, modelPath = null, loadModel = null, scale = 1, speed = 25, maxDistance = 80, colliderRadius = 0.6, rotation = null, damage = 50, team = 'neutral', lifetime = 5.0 }) {
    this.world = world;
    this.scene = scene;
    this.mesh = null;
    this.isModelLoaded = false;
    this.maxDistance = maxDistance;
    this.speed = speed;
    this.direction = direction.clone().normalize();
    this.damage = damage; // Damage dealt on hit
    this.team = team; // 'player', 'enemy', or 'neutral'
    this.hasHit = false; // Track if projectile has already hit something
    this.spawnTime = performance.now(); // Track when projectile was created
    this.lifetime = lifetime; // Seconds before auto-expiry (configurable per role)
    
    try {
      // Setup physics first
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.0);
      this.rigidBody = world.createRigidBody(bodyDesc);
      
      const colliderDesc = RAPIER.ColliderDesc.ball(colliderRadius);
      this.collider = world.createCollider(colliderDesc, this.rigidBody);
      
      const impulse = { x: this.direction.x * speed, y: 0, z: this.direction.z * speed };
      this.rigidBody.applyImpulse(impulse, true);
      
      this.startPosition = position.clone();
      
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
      
      this.mesh = await loadModel(modelPath, scale, rotation, position);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.isModelLoaded = true;
      
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
      const distance = Math.sqrt(
        Math.pow(projectilePos.x - playerPos.x, 2) +
        Math.pow(projectilePos.y - playerPos.y, 2) +
        Math.pow(projectilePos.z - playerPos.z, 2)
      );
      
      // Collision radius (sum of both colliders)
      if (distance < 3) { // Adjust this value based on your game scale
        player.takeDamage(this.damage);
        this.hasHit = true;
        return true; // Signal to remove projectile
      }
    }
    
    // Check collision with enemies (if projectile is from player)
    if (this.team === 'player' && enemies) {
      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        
        const enemyPos = enemy.rigidBody.translation();
        const distance = Math.sqrt(
          Math.pow(projectilePos.x - enemyPos.x, 2) +
          Math.pow(projectilePos.y - enemyPos.y, 2) +
          Math.pow(projectilePos.z - enemyPos.z, 2)
        );
        
        // Collision radius
        if (distance < 5) { // Adjust based on enemy size
          enemy.takeDamage(this.damage);
          this.hasHit = true;
          return true; // Signal to remove projectile
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

      // Check for collisions
      if (this.checkCollision(player, enemies)) {
        return true; // Dispose projectile
      }
      
      // Only update position if model is loaded
      if (this.isModelLoaded && this.mesh) {
        const physicsPos = this.rigidBody.translation();
        this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
        
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
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) {
          if (Array.isArray(this.mesh.material)) {
            this.mesh.material.forEach(mat => mat.dispose());
          } else {
            this.mesh.material.dispose();
          }
        }
      }
      if (this.world && this.rigidBody) {
        this.world.removeRigidBody(this.rigidBody);
      }
    } catch (error) {
      console.error('Projectile dispose failed:', error);
    }
  }
}