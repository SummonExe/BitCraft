import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

export default class Character {
  constructor(world, scene, position) {
    this.scene = scene;
    this.position = position;
    this.world = world;

    const loader = new GLTFLoader();
    loader.load('/src/assets/character/undercover_cop/undercover_cop_-_animated.glb', (gltf) => {
      this.model = gltf.scene;
      this.model.position.copy(position);
      this.model.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      scene.add(this.model);

      // Physics setup
      const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic).setTranslation(0, 2, 0);
      this.rigidBody = world.createRigidBody(rigidBodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 1, 0.5); // x, y, z half-extents
      world.createCollider(colliderDesc, this.rigidBody);

      // Temporary ground collider
      const groundBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed).setTranslation(0, 0, 0);
      const groundBody = world.createRigidBody(groundBodyDesc);
      const groundColliderDesc = RAPIER.ColliderDesc.cuboid(125, 0.1, 125); // Matches 250x250 ground
      world.createCollider(groundColliderDesc, groundBody);
    });

    // Controls setup (placeholder)
    this.keys = {};
    document.addEventListener('keydown', (e) => this.keys[e.key] = true);
    document.addEventListener('keyup', (e) => this.keys[e.key] = false);
  }

  update() {
    // Basic physics update
    if (this.rigidBody) {
      const position = this.rigidBody.translation();
      this.model.position.set(position.x, position.y, position.z);
    }

    // Updated control logic with flipped forward/backward
    const moveScale = 0.25;
    if (this.keys['w'] || this.keys['ArrowUp']) {
      this.rigidBody.applyImpulse({ x: 0, y: 0, z: moveScale }, true); // Move forward (positive z)
    }
    if (this.keys['s'] || this.keys['ArrowDown']) {
      this.rigidBody.applyImpulse({ x: 0, y: 0, z: -moveScale }, true); // Move backward (negative z)
    }
    if (this.keys['a'] || this.keys['ArrowLeft']) {
      this.rigidBody.applyImpulse({ x: moveScale, y: 0, z: 0 }, true); // Move left
    }
    if (this.keys['d'] || this.keys['ArrowRight']) {
      this.rigidBody.applyImpulse({ x: -moveScale, y: 0, z: 0 }, true); // Move right
    }
  }
}