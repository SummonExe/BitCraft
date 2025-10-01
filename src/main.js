import { Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, AmbientLight, Vector3 } from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from './assets/character/undercover_cop/character.js';

let clock = new Clock();

async function init() {
  await RAPIER.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  const textureLoader = new TextureLoader();
  const groundTexture = textureLoader.load('/src/assets/textures/Cobblestone.png', undefined, undefined, (error) => {
    console.error('Texture loading failed:', error);
  });
  const groundMaterial = new MeshStandardMaterial({ map: groundTexture, side: DoubleSide });
  const groundGeometry = new PlaneGeometry(1000, 1000);
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = Math.PI / 2;
  scene.add(ground);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  const character = new Character(world, scene, { x: 0, y: 2, z: 0 });

  // Move offset to a higher scope
  const offset = new Vector3(0, 3, -5);

  // Wait for model to load before setting up camera
  function setupCamera() {
    camera.position.copy(character.model.position).add(offset);
    camera.lookAt(character.model.position);
  }
  if (character.model) {
    setupCamera();
  } else {
    const checkModel = setInterval(() => {
      if (character.model) {
        setupCamera();
        clearInterval(checkModel);
      }
    }, 100); // Check every 100ms
  }

  camera.position.set(0, 10, 50);

  function animate() {
    const delta = clock.getDelta();
    world.step();
    character.update(delta);

    if (character.model) {
      const targetPosition = character.model.position.clone().add(offset);
      camera.position.lerp(targetPosition, 0.07);
      camera.lookAt(character.model.position);
    }

    renderer.render(scene, camera);
  }
}

init();