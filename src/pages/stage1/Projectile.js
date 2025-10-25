import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

export class Projectile {
  constructor({ position, direction }, { world, scene }) {
    this.world = world;
    this.scene = scene;
    try {
      const geometry = new THREE.SphereGeometry(0.5, 16, 16);
      const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      this.mesh = new THREE.Mesh(geometry, material);
      this.mesh.castShadow = true;
      if (scene) {
        scene.add(this.mesh);
      } else {
        throw new Error('Scene is undefined');
      }
      
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.0);
      this.rigidBody = world.createRigidBody(bodyDesc);
      
      const colliderDesc = RAPIER.ColliderDesc.ball(0.5);
      world.createCollider(colliderDesc, this.rigidBody);
      
      const speed = 20;
      const impulse = { x: direction.x * speed, y: 0, z: direction.z * speed };
      this.rigidBody.applyImpulse(impulse, true);
      
      this.startPosition = position.clone();
    } catch (error) {
      console.error('Failed to initialize projectile:', error);
    }
  }
  
  update() {
    try {
      const physicsPos = this.rigidBody.translation();
      this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
      
      const distance = this.startPosition.distanceTo(new THREE.Vector3(physicsPos.x, physicsPos.y, physicsPos.z));
      if (distance >= 20) {
        return true;
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
      }
      if (this.world && this.rigidBody) {
        this.world.removeRigidBody(this.rigidBody);
      }
    } catch (error) {
      console.error('Projectile dispose failed:', error);
    }
  }
}