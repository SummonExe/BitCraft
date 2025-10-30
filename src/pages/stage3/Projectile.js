import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

export class Projectile {
  constructor({ position, direction }, { world, scene, color = 0xff0000, modelPath = null, loadModel = null, scale = 1, speed = 20, maxDistance = 20, colliderRadius = 0.5, rotation = null }) {
    this.world = world;
    this.scene = scene;
    this.mesh = null;
    this.isModelLoaded = false;
    this.maxDistance = maxDistance;
    this.speed = speed;
    this.direction = direction.clone().normalize();
    
    try {
      // Setup physics first
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.0);
      this.rigidBody = world.createRigidBody(bodyDesc);
      
      const colliderDesc = RAPIER.ColliderDesc.ball(colliderRadius);
      world.createCollider(colliderDesc, this.rigidBody);
      
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
  
  update() {
    try {
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