import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

function createSphere(scene, world) {
  // Visual sphere
  const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphereMesh.position.set(0, 5, 0); // Start above ground
  scene.add(sphereMesh);

  // Physics sphere
  const sphereBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0);
  const sphereBody = world.createRigidBody(sphereBodyDesc);
  const sphereShape = RAPIER.ColliderDesc.ball(1); // Radius 1
  world.createCollider(sphereShape, sphereBody);

  return { mesh: sphereMesh, body: sphereBody };
}

export { createSphere };