import { 
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, 
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, 
  AmbientLight, Vector3, Quaternion, Color, AnimationMixer, Box3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from '../../assets/character/undercover_cop/character.js';
import MiniMap from "../../MiniMAp.js";

let clock = new Clock();
let world;
let currentScene = "maze";
let mazeSize = null;
let isSwitching = false;

async function init() {
  await RAPIER.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  // ground
  const textureLoader = new TextureLoader();
  const groundTexture = textureLoader.load('/src/assets/textures/Cobblestone.png');
  const groundMaterial = new MeshStandardMaterial({ map: groundTexture, side: DoubleSide });
  const groundGeometry = new PlaneGeometry(250, 250);
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  // physics world
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // ground collider
  {
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const groundBody = world.createRigidBody(groundDesc);
    const groundCollider = RAPIER.ColliderDesc.cuboid(125, 0.1, 125);
    world.createCollider(groundCollider, groundBody);
  }

  // character
  const character = new Character(world, scene, { x: 0, y: 2, z: 0 });
  const cameraOffset = new Vector3(0, 3, -6);
  const lookAtOffset = new Vector3(0, 1.5, 0);

  // bookkeeping
  let activeColliders = [];
  let activeBuildingRoots = [];
  let flashingObjects = [];
  let doorMixers = [];
  let coins = [];
  let score = 0;
  let scoreElement;

  const loader = new GLTFLoader();

  // --------------------------
  // BUILDING LOADER
  // --------------------------
  function loadBuilding(url, positionOffset, name = "", targetScale = null) {
    return new Promise((resolve) => {
      loader.load(url, (gltf) => {
        const building = gltf.scene;
        if (name) building.name = name;
        building.position.copy(positionOffset);

        if (name === "bedroom") {
          building.position.y = 0;
          building.scale.set(0.5, 0.5, 0.5);
        } else {
          building.position.y = -50;
          building.scale.set(1, 1, 1);
        }
        if (targetScale) building.scale.copy(targetScale);

        scene.add(building);
        activeBuildingRoots.push(building);
        building.updateMatrixWorld(true);

        const bbox = new Box3().setFromObject(building);
        const size = new Vector3();
        bbox.getSize(size);

        building.traverse((child) => {
          if (child.isMesh && child.geometry) {
            try {
              const geometry = child.geometry.clone();
              geometry.applyMatrix4(child.matrixWorld);
              const posAttr = geometry.attributes.position;
              if (!posAttr) return;
              const vertices = new Float32Array(posAttr.array.slice(0));
              const indices = geometry.index ? new Uint32Array(geometry.index.array.slice(0)) : null;
              geometry.dispose?.();
              if (!indices) return;

              const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
              const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
              const rigidBody = world.createRigidBody(rigidBodyDesc);
              const collider = world.createCollider(colliderDesc, rigidBody);
              activeColliders.push(collider);
            } catch (err) {
              console.warn("Failed to create collider for mesh:", child.name, err);
            }
          }
        });

        resolve(size);
      }, undefined, (err) => {
        console.error("Failed to load building:", url, err);
        resolve(new Vector3(1, 1, 1));
      });
    });
  }

  // --------------------------
  // FLASHING MODEL
  // --------------------------
  function loadFlashingModel(url, position) {
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      model.position.copy(position);
      model.scale.set(1, 1, 1);
      model.rotation.y = Math.PI / 2;
      scene.add(model);
      activeBuildingRoots.push(model);

      model.traverse((child) => {
        if (child.isMesh) {
          if (!('emissive' in child.material)) child.material.emissive = new Color(0x00ff00);
          child.material.emissiveIntensity = 1;
        }
      });

      model.userData.flashTime = 0;
      flashingObjects.push(model);
    }, undefined, (err) => console.error("Failed to load flashing model:", err));
  }
  function updateFlashing(delta) {
    for (const obj of flashingObjects) {
      obj.userData.flashTime += delta * 5;
      const intensity = (Math.sin(obj.userData.flashTime) + 1) / 2 * 2;
      obj.traverse((child) => {
        if (child.isMesh) child.material.emissiveIntensity = intensity;
      });
    }
  }

  // --------------------------
  // DOORS
  // --------------------------
  function loadDoorModel(url, position) {
    loader.load(url, (gltf) => {
      const door = gltf.scene;
      door.rotation.y = Math.PI;
      door.scale.set(11, 14, 30);
      door.position.copy(position);
      scene.add(door);
      activeBuildingRoots.push(door);

      try {
        const doorBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
        const doorBody = world.createRigidBody(doorBodyDesc);
        const doorCollider = RAPIER.ColliderDesc.cuboid(1, 3, 0.2).setSensor(true);
        const col = world.createCollider(doorCollider, doorBody);
        activeColliders.push(col);
      } catch (e) {
        console.warn("Failed to create door collider:", e);
      }

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new AnimationMixer(door);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
        door.userData.mixer = mixer;
        doorMixers.push(mixer);
      }
    }, undefined, (err) => console.error("Failed to load door model:", err));
  }
  function updateDoors(delta) {
    for (const mixer of doorMixers) mixer.update(delta);
  }

  // --------------------------
  // MINIMAP
  // --------------------------
  let miniMap = null;
  function initMiniMap() {
    miniMap = new MiniMap(renderer, scene, character);
  }

  // --------------------------
  // COINS
  // --------------------------
  scoreElement = document.createElement("div");
  scoreElement.style.position = "absolute";
  scoreElement.style.top = "10px";
  scoreElement.style.left = "150px";
  scoreElement.style.color = "white";
  scoreElement.style.fontFamily = "Arial, sans-serif";
  scoreElement.style.fontSize = "18px";
  scoreElement.style.fontWeight = "700";
  scoreElement.style.background = "rgba(0,0,0,0.45)";
  scoreElement.style.padding = "6px 8px";
  scoreElement.style.borderRadius = "6px";
  scoreElement.innerText = "Score: 0";
  document.body.appendChild(scoreElement);

  function loadCoin(url, position) {
    loader.load(url, (gltf) => {
      const coin = gltf.scene.clone();
      coin.position.copy(position);
      coin.scale.set(0.2, 0.2, 0.2);
      coin.rotation.y = 0;
      coin.userData = coin.userData || {};
      coin.userData.pulseTime = Math.random() * Math.PI * 2;
      scene.add(coin);
      activeBuildingRoots.push(coin);
      coins.push(coin);

      coin.traverse((child) => {
        if (child.isMesh) {
          if (!('emissive' in child.material)) child.material.emissive = new Color(0xffff00);
          child.material.emissiveIntensity = 0.8;
        }
      });
    }, undefined, (err) => console.error("Failed to load coin:", err));
  }
  function updateCoins(delta, pos) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const coin = coins[i];
      coin.rotation.y += delta * 3.5;
      coin.userData.pulseTime += delta * 4;
      const intensity = (Math.sin(coin.userData.pulseTime) + 1) / 2 * 1.8 + 0.2;
      coin.traverse((child) => {
        if (child.isMesh) child.material.emissiveIntensity = intensity;
      });

      const dx = pos.x - coin.position.x;
      const dy = pos.y - coin.position.y;
      const dz = pos.z - coin.position.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < 2.0) {
        scene.remove(coin);
        coins.splice(i, 1);
        score += 5;
        scoreElement.innerText = "Score: " + score;
      }
    }
  }

  // --------------------------
  // UNLOAD
  // --------------------------
  function unloadActiveBuilding() {
    for (const col of activeColliders) {
      try { world.removeCollider(col, true); }
      catch (e) { try { world.removeCollider(col); } catch {} }
    }
    activeColliders.length = 0;

    for (const root of activeBuildingRoots) {
      root.traverse((node) => {
        if (node.isMesh) {
          try { if (node.geometry) node.geometry.dispose?.(); } catch {}
          try {
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(m => { if (m.map) m.map.dispose?.(); m.dispose?.(); });
              } else {
                if (node.material.map) node.material.map.dispose?.();
                node.material.dispose?.();
              }
            }
          } catch {}
        }
      });
      scene.remove(root);
    }
    activeBuildingRoots.length = 0;
    flashingObjects.length = 0;
    doorMixers.length = 0;
  }

  // --------------------------
  // SCENE SWITCHING
  // --------------------------
  async function switchScene(filePath, name = "") {
    console.log("Switching scene to:", name);
    isSwitching = true;
    unloadActiveBuilding();
    const targetScale = name === "bedroom" ? new Vector3(0.5, 0.5, 0.5) : new Vector3(1, 1, 1);
    mazeSize = await loadBuilding(filePath, new Vector3(0, name === "bedroom" ? 0 : -50, 0), name, targetScale);

    character.rigidBody.setTranslation({ x: 0, y: 2, z: 0 }, true);
    character.model.scale.set(1.5, 1.5, 1.5);
    character.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    character.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    character.update(0);
    updateCamera(0);
    isSwitching = false;
  }

  // --------------------------
  // INITIAL LOAD
  // --------------------------
  async function loadInitialScene() {
    mazeSize = await loadBuilding('../../assets/models/maze_room.glb', new Vector3(0, -50, 0), "maze_room");
  }

  loadFlashingModel('../../assets/models/arrow.glb', new Vector3(-45.78, 0.60, -76.07));
  loadFlashingModel('../../assets/models/arrow.glb', new Vector3(-45.78, 0.60, 30.00));
  loadDoorModel('../../assets/models/door_wood.glb', new Vector3(-28.28, -48.51, -74.33));
  loadCoin('../../assets/models/coin_point.glb', new Vector3(-35, -21, -145));
  loadCoin('../../assets/models/coin_point.glb', new Vector3(-45, 2, -105));
  loadCoin('../../assets/models/coin_point.glb', new Vector3(-45, 2, -25));
  loadCoin('../../assets/models/coin_point.glb', new Vector3(-30, 2, 25));
  loadCoin('../../assets/models/coin_point.glb', new Vector3(24, 2, 25));

  await loadInitialScene();
  initMiniMap();

  function updateCamera(delta) {
    if (!character.model) return;
    const rotatedOffset = cameraOffset.clone().applyAxisAngle(
      new Vector3(0, 1, 0),
      character.model.rotation.y
    );
    const desiredPos = character.model.position.clone().add(rotatedOffset);
    camera.position.lerp(desiredPos, 5 * delta);
    const lookTarget = character.model.position.clone().add(lookAtOffset);
    camera.lookAt(lookTarget);
  }

  function animate() {
    const delta = clock.getDelta();
    if (!isSwitching) {
      world.step();
      character.update(delta);
      updateFlashing(delta);
      updateDoors(delta);
    }
    updateCamera(delta);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);

    if (character.model) {
      const pos = character.model.position;
      if (miniMap) miniMap.update(pos);
      updateCoins(delta, pos);

      if (currentScene === "maze") {
        const dy = pos.y - (-48.51);
        const dz = pos.z - (-74.33);
        const dist = Math.sqrt(dy * dy + dz * dz);
        if (dist < 10) {
          currentScene = "bedroom";
          switchScene("../../assets/models/hill_room.glb", "bedroom");
        }
      }
    }
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();
