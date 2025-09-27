import * as THREE from 'three';
import { initPhysics, world } from './physics.js';
import { createCharacter } from './objects.js';
import { setupCameraControls } from './controls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87ceeb);
document.body.appendChild(renderer.domElement);

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5); // Sun-like light
directionalLight.position.set(5, 10, 5); // Above and offset
scene.add(directionalLight);

// Move camera to see ground
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, 0);

// Add ground mesh
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xADD8E6, side: THREE.DoubleSide });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// Initialize objects and controls
initPhysics().then(async () => {
  const character = await createCharacter(scene, world); // Load character
  const cameraControls = setupCameraControls(camera);

  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Step physics simulation

    // Sync character with physics
    if (character) {
      const charPos = character.body.translation();
      const charRot = character.body.rotation(); // Fix: Use rotation() for quaternion
      character.mesh.position.set(charPos.x, charPos.y, charPos.z);
      character.mesh.quaternion.set(charRot.x, charRot.y, charRot.z, charRot.w); // Sync quaternion
    }

    // Update camera controls
    cameraControls.update();

    renderer.render(scene, camera);
  }
  animate();
}).catch((err) => {
  console.error('Physics init failed:', err);
});