import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export default class Building {
  constructor(world, scene, position) {
    this.scene = scene;
    this.position = position;
    this.world = world;

    const loader = new GLTFLoader();
    loader.load('/src/assets/scene/church/church_of_st_peter_stourton.glb', (gltf) => {
      this.model = gltf.scene;
      this.model.position.copy(position);
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(this.model);

      // Physics setup for static building
      const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed)
        .setTranslation(position.x, position.y, position.z);
      this.rigidBody = world.createRigidBody(rigidBodyDesc);

      // Approximate collider for the church (adjust size based on model scale)
      const colliderDesc = RAPIER.ColliderDesc.cuboid(5, 5, 5); // Rough size, adjust as needed
      world.createCollider(colliderDesc, this.rigidBody);
    }, undefined, (error) => {
      console.error('GLTF loading error for building:', error);
    });
  }

  update(delta) {
    // No dynamic updates needed for a static building
    if (this.rigidBody) {
      const position = this.rigidBody.translation();
      this.model.position.set(position.x, position.y, position.z);
    }
  }
}