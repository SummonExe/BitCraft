import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Placeholder import - replace with actual building model path
import buildingModel from "../../../public/models/theMansion/the_mansion.glb?url"; 
// const buildingModel = "../../../models/theMansion/the_mansion.glb"; 


export class Building {
  constructor({ position, modelPath = buildingModel, scale = 1, world, scene, loadModel }) {
    this.modelPath = modelPath;
    this.world = world;
    this.scene = scene;
    this.model = null;

    // Physics setup - Static rigid body
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);
    this.rigidBody = world.createRigidBody(bodyDesc);

    // Start async model loading
    this.loadPromise = this.loadModel(position, scale, loadModel, scene);
  }

  async loadModel(initialPosition, scale, loadModel, scene) {
    try {
      const rotation = new THREE.Euler(0, 0, 0); // No initial rotation - adjust if needed
      this.model = await loadModel(this.modelPath, scale, rotation, new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));

      // Enable shadows on building model
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Add collider based on model (simplified cuboid - adjust dimensions to match building size)
      const colliderDesc = RAPIER.ColliderDesc.cuboid(10, 10, 10); // Placeholder size - measure your model and adjust
      this.world.createCollider(colliderDesc, this.rigidBody);

    } catch (error) {
      console.error('Building model loading failed:', error);
      throw error;
    }
  }

  // No update needed for static building
  update() {
    // Optional: Sync if any dynamic changes, but static so empty
  }
}