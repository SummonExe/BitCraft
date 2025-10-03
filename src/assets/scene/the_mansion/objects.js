import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export default class Room {
  constructor(world, scene, position) {
    this.scene = scene;
    this.position = position;
    this.world = world;

    const loader = new GLTFLoader();
    loader.load('/src/assets/scene/the_mansion/the_mansion.glb', (gltf) => {
      this.model = gltf.scene;
      this.model.position.copy(position);
      scene.add(this.model);

      // Create fixed rigidbody at position
      const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed)
        .setTranslation(position.x, position.y, position.z);
      this.rigidBody = world.createRigidBody(rigidBodyDesc);

      // Traverse to add shadows and colliders
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Create trimesh collider for each mesh
          const geometry = child.geometry;
          if (geometry.attributes.position && geometry.index) {
            // Apply scale to vertices
            const vertexCount = geometry.attributes.position.count;
            const vertices = new Float32Array(vertexCount * 3);
            for (let i = 0; i < vertexCount; i++) {
              vertices[i * 3] = geometry.attributes.position.getX(i) * child.scale.x;
              vertices[i * 3 + 1] = geometry.attributes.position.getY(i) * child.scale.y;
              vertices[i * 3 + 2] = geometry.attributes.position.getZ(i) * child.scale.z;
            }
            const indices = new Uint32Array(geometry.index.array);

            const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
              .setTranslation(child.position.x, child.position.y, child.position.z)
              .setRotation(child.quaternion);

            world.createCollider(colliderDesc, this.rigidBody);
          }
        }
      });
    }, undefined, (error) => {
      console.error('GLTF loading error for room:', error);
    });
  }

  update(delta) {
    // No dynamic updates needed for a static room
    if (this.rigidBody) {
      const position = this.rigidBody.translation();
      this.model.position.set(position.x, position.y, position.z);
    }
  }
}