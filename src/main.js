import * as THREE from 'three';
import { initPhysics, world } from './physics.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.z = 5;

// Initialize physics and start animation
initPhysics().then(() => {
  function animate() {
    requestAnimationFrame(animate);
    world.step(); // Step physics simulation
    renderer.render(scene, camera);
  }
  animate();
}).catch((err) => {
  console.error('Physics init failed:', err);
});