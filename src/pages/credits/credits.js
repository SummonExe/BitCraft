import * as THREE from 'three';
import creditsData from '/public/credits.json' assert { type: 'json' };

const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('bgCanvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
canvasContainer.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00cc00, transparent: true, opacity: 0.3 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 10;
cube.position.y = -2; // Move cube below text

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.005;
  cube.rotation.y += 0.005;
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Display credits
const creditsContent = document.getElementById('creditsContent');
let html = '<h1 style="font-size: 2em; margin-bottom: 20px;">Credits</h1>';

// Authors section
html += '<div class="group"><h2>Authors</h2><ul>';
creditsData.authors.forEach(author => {
  html += `<li style="margin: 10px 0;">${author.name} (Student #: ${author.stuNum})</li>`;
});
html += '</ul></div>';

// Assets section
html += '<div class="group"><h2>Assets</h2><ul>';
creditsData.credits.forEach(credit => {
  html += `<li class="credit-item">${credit.credit} (Files: ${credit.file.join(', ')})</li>`;
});
html += '</ul></div>';

creditsContent.innerHTML = html;