import * as THREE from 'three';
import creditsData from './credits.json' assert { type: 'json' };

const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('bgCanvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Dark particle system similar to main menu
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 5000;

const posArray = new Float32Array(particlesCount * 3);
const colorsArray = new Float32Array(particlesCount * 3);

for(let i = 0; i < particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 50;
    colorsArray[i] = Math.random() * 0.3;
    if (i % 3 === 0) colorsArray[i] += 0.1; // Red channel
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));

const particlesMaterial = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.6
});

const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// Dark fog effect
scene.fog = new THREE.FogExp2(0x0a0a0a, 0.02);

camera.position.z = 5;

function animate() {
  requestAnimationFrame(animate);
  
  // Gentle rotation of particles
  particlesMesh.rotation.y += 0.001;
  particlesMesh.rotation.x += 0.0005;
  
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Interactive mouse movement
document.addEventListener('mousemove', (event) => {
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    
    particlesMesh.rotation.x = mouseY * 0.05;
    particlesMesh.rotation.y = mouseX * 0.05;
});

// Display credits
const creditsContent = document.getElementById('creditsContent');
let html = '<h1 class="credits-title">CREDITS</h1>';

// Create two-column layout
html += '<div class="content-grid">';

// Authors section
html += '<div class="authors-section">';
html += '<h2 class="section-title">AUTHORS</h2>';
html += '<ul class="authors-list">';
creditsData.authors.forEach(author => {
  html += `<li>${author.name}<br><span style="font-size: 0.8em; color: #cc0000;">Student #: ${author.stuNum}</span></li>`;
});
html += '</ul></div>';

// Assets section
html += '<div class="assets-section">';
html += '<h2 class="section-title">ASSETS</h2>';
html += '<ul class="credits-list">';
creditsData.credits.forEach(credit => {
  html += `
    <li class="credit-item">
      <span class="credit-resource">${credit.resource}</span>
      <a href="${credit.link}" target="_blank" class="credit-link">${credit.link}</a>
      <div class="credit-description">${credit.credit}</div>
      <div class="credit-files">Files: ${credit.file.join(', ')}</div>
    </li>
  `;
});
html += '</ul></div>';
html += '</div>'; // Close content-grid

// Back button
html += '<div class="back-button-container">';
html += '<a href="../../../index.html" class="back-button">BACK TO MAIN MENU</a>';
html += '</div>';

creditsContent.innerHTML = html;