import * as THREE from 'three';
import { initPhysics, world } from './physics.js';
import { createSphere } from './objects.js';
import { setupCameraControls } from './controls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Move camera to see ground
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// Add ground mesh
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2; // Lay flat
scene.add(groundMesh);

// Initialize objects and controls
initPhysics().then(() => {
  const sphere = createSphere(scene, world);
  const cameraControls = setupCameraControls(camera);

  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Step physics simulation

    // Sync sphere with physics
    const spherePos = sphere.body.translation();
    sphere.mesh.position.set(spherePos.x, spherePos.y, spherePos.z);

    // Update camera controls
    cameraControls.update();

    renderer.render(scene, camera);
  }
  animate();
}).catch((err) => {
  console.error('Physics init failed:', err);
});