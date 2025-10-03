import * as THREE from 'three';
import * as YUKA from 'yuka';
import RAPIER from '@dimforge/rapier3d-compat';

export class Projectile {
  constructor({ position, direction }, { world }) {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    
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
  }
  
  update() {
    const physicsPos = this.rigidBody.translation();
    this.mesh.position.set(physicsPos.x, physicsPos.y, physicsPos.z);
    
    const distance = this.startPosition.distanceTo(new THREE.Vector3(physicsPos.x, physicsPos.y, physicsPos.z));
    if (distance >= 20) {
      return true;
    }
    return false;
  }
  
  dispose() {
    scene.remove(this.mesh);
    world.removeRigidBody(this.rigidBody);
  }
}