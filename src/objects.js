import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function createSphere(scene, world) {
  const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphereMesh.position.set(0, 5, 0);
  scene.add(sphereMesh);

  const sphereBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0);
  const sphereBody = world.createRigidBody(sphereBodyDesc);
  const sphereShape = RAPIER.ColliderDesc.ball(1);
  world.createCollider(sphereShape, sphereBody);

  return { mesh: sphereMesh, body: sphereBody };
}

async function createCharacter(scene, world) {
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      '../assets/models/characters/beast_hunter/beast_hunter_character_model.glb', // Updated path
      (gltf) => {
        const character = gltf.scene;
        character.position.set(0, 0, 0); // Start on ground
        character.scale.set(1, 1, 1.0); // Adjust if needed
        
        scene.add(character);

        const characterBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0);
        const characterBody = world.createRigidBody(characterBodyDesc);
        const characterShape = RAPIER.ColliderDesc.cuboid(0.5, 1, 0.5);
        world.createCollider(characterShape, characterBody);

        console.log('Character loaded:', character);
        resolve({ mesh: character, body: characterBody });
      },
      (progress) => {
        console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading character:', error);
      }
    );
  });
}

export { createSphere, createCharacter };   