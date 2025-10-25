import { 
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, 
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, 
  AmbientLight, Vector3, Quaternion, Color, AnimationMixer, Box3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from '../../assets/character/undercover_cop/character_2.js';
import MiniMap from "../../MiniMap.js";

import FlashingModel from "../../assets/models/arrow.glb";
import DoorModel from "../../assets/models/door_wood.glb";
import Coin from "../../assets/models/holy_water.glb";
import Building from "../../assets/models/maze_room.glb";
import bedroom from "../../assets/models/hill_room.glb";
// import {  } from "../../assets/models/";
// import {  } from "../../assets/models/";

let clock = new Clock();
let world;
let currentScene = "maze";
let mazeSize = null;
let isSwitching = false;
let groundCollider = null; // To track the current ground collider

async function init() {
  await RAPIER.init();

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  // physics world
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

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
  // GROUND COLLIDER
  // --------------------------
  function createGroundCollider(yPosition) {
    if (groundCollider) {
      world.removeCollider(groundCollider, true);
      groundCollider = null;
    }
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, yPosition, 0);
    const groundBody = world.createRigidBody(groundDesc);
    groundCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(125, 0.1, 125), groundBody);
  }

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
          createGroundCollider(0); // Floor at y=0 for bedroom
        } else {
          building.position.y = -50;
          building.scale.set(1, 1, 1);
          createGroundCollider(-50); // Floor at y=-50 for maze
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
  // SNAP TO GROUND
  // --------------------------
  function snapToGround(character, controller, delta) {
    if (!character.rigidBody || !controller) return;

    // Cast a ray downward to detect the ground
    const ray = new RAPIER.Ray(
      { x: character.rigidBody.translation().x, y: character.rigidBody.translation().y, z: character.rigidBody.translation().z },
      { x: 0, y: -1, z: 0 }
    );
    const maxToi = 0.5; // Max distance to check for ground (adjust based on character height)
    const hit = world.castRay(ray, maxToi, true);

    if (hit && hit.toi < maxToi) {
      const groundY = character.rigidBody.translation().y - hit.toi;
      const currentY = character.rigidBody.translation().y;
      if (Math.abs(currentY - groundY) < 0.5) { // Snap if close to ground
        character.rigidBody.setTranslation(
          {
            x: character.rigidBody.translation().x,
            y: groundY + 0.1, // Small offset to prevent sinking
            z: character.rigidBody.translation().z
          },
          true
        );
      }
    }
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
  // scoreElement.style.fontFamily = "Arial, sans-serif";
  scoreElement.style.fontSize = "18px";
  scoreElement.style.fontWeight = "700";
  scoreElement.style.background = "rgba(0,0,0,0.45)";
  scoreElement.style.padding = "6px 8px";
  scoreElement.style.borderRadius = "6px";
  scoreElement.innerText = "Holy Water: 0";
  document.body.appendChild(scoreElement);

  function loadCoin(url, position) {
    loader.load(url, (gltf) => {
      const coin = gltf.scene.clone();
      coin.position.copy(position);
      coin.scale.set(0.005, 0.005, 0.005);
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
        scoreElement.innerText = "Holy Water: " + score;
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
  // DIALOGUE SYSTEM
  // --------------------------
  const dialogueBox = document.createElement("div");
  dialogueBox.id = "dialogue-box";
  dialogueBox.style.position = "absolute";
  dialogueBox.style.bottom = "60px";
  dialogueBox.style.left = "50%";
  dialogueBox.style.transform = "translateX(-50%)";
  dialogueBox.style.minWidth = "600px";
  dialogueBox.style.maxWidth = "80%";
  dialogueBox.style.padding = "16px 24px";
  dialogueBox.style.border = "2px solid #6c5ce7";
  dialogueBox.style.borderRadius = "12px";
  dialogueBox.style.background = "rgba(0, 0, 0, 0.85)";
  dialogueBox.style.color = "#fff";
  // dialogueBox.style.fontFamily = "monospace";
  dialogueBox.style.fontSize = "18px";
  dialogueBox.style.display = "none";
  dialogueBox.style.zIndex = "999";
  document.body.appendChild(dialogueBox);

  const DIALOGUE = [
    { speaker: "Man", text: "You're safe now. I found you just in time.Come on, let's get you out of here. There are people waiting for you." },
  ];

  function showDialogueSequence(lines, typingSpeed = 28, onFinish = null) {
    let index = 0;

    function typeLine(line, cb) {
      let charIndex = 0;
      dialogueBox.innerHTML = `<strong style="color:#74b9ff;">${line.speaker}</strong><br><span id="dialogue-text"></span>
      <div style="font-size:14px; color:#888; text-align:right;">Click to continue →</div>`;
      dialogueBox.style.display = "block";

      const dialogueText = document.getElementById("dialogue-text");
      dialogueText.textContent = "";

      let typingInterval = setInterval(() => {
        dialogueText.textContent += line.text.charAt(charIndex);
        charIndex++;
        if (charIndex >= line.text.length) {
          clearInterval(typingInterval);
        }
      }, typingSpeed);

      const clickHandler = () => {
        clearInterval(typingInterval);
        dialogueText.textContent = line.text;
        dialogueBox.removeEventListener("click", clickHandler);
        cb();
      };

      dialogueBox.addEventListener("click", clickHandler);
    }

    function nextDialogue() {
      if (index >= lines.length) {
        dialogueBox.style.display = "none";
        if (onFinish) onFinish();
        return;
      }
      typeLine(lines[index], () => {
        index++;
        dialogueBox.addEventListener("click", nextDialogue, { once: true });
      });
    }

    nextDialogue();
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
    if (character.model) character.model.scale.set(1.8, 1.8, 1.8);
    character.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    character.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    character.update(0);
    updateCamera(0);

    if (name === "bedroom") {
      character.canMove = () => false;
      showDialogueSequence(DIALOGUE, 28, () => {
        character.canMove = () => true;
      });
    } else {
      character.canMove = () => true;
    }

    isSwitching = false;
  }

  // --------------------------
  // INITIAL LOAD
  // --------------------------
  async function loadInitialScene() {
    mazeSize = await loadBuilding(Building, new Vector3(0, -50, 0), "maze_room");
  }

  loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, -46.07));
  loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, 30.00));
  loadDoorModel(DoorModel, new Vector3(-28.28, -48.51, -74.33));
  loadCoin(Coin, new Vector3(-35, -21, -145));
  loadCoin(Coin, new Vector3(-45, 2, -65));
  loadCoin(Coin, new Vector3(-30, 2, 25));
  loadCoin(Coin, new Vector3(24, 2, 25));

  await loadInitialScene();
  initMiniMap();

  // --------------------------
  // MUSIC
  // --------------------------
  const bgMusic = new Audio("https://play.rosebud.ai/assets/windy_day_ambience_01.wav?gq3B");
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play();

  function updateCamera(delta) {
    if (!character.model) return;
    const rotatedOffset = cameraOffset.clone().applyAxisAngle(
      new Vector3(0, 1, 0),
      character.model.rotation.y
    );
    const desiredPos = character.model.position.clone().add(rotatedOffset);
    camera.position.lerp(desiredPos, 2.5 * delta);
    const lookTarget = character.model.position.clone().add(lookAtOffset);
    camera.lookAt(lookTarget);
  }

  function animate() {
    const delta = clock.getDelta();
    if (!isSwitching) {
      world.step();
      // Update character controller with stair-stepping parameters
      if (character.controller) {
        character.controller.enableSnapToGround(0.5); // Snap to ground within 0.5 units
        character.controller.setMaxSlopeClimbAngle(Math.PI / 4); // Allow climbing slopes up to 45 degrees
        character.controller.setMinSlideAngle(Math.PI / 6); // Slide on slopes steeper than 30 degrees
        character.controller.setStepOffset(0.5); // Allow stepping up to 0.5 units (adjust for stair height)
      }
      character.update(delta);
      snapToGround(character, character.controller, delta); // Snap to ground
      updateFlashing(delta);
      updateDoors(delta);
    }
    updateCamera(delta);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);

    if (character.model) {
      character.model.scale.set(1.5, 1.5, 1.5);
      const pos = character.model.position;
      if (miniMap) miniMap.update(pos);
      updateCoins(delta, pos);

      if (currentScene === "maze") {
        const dy = pos.y - (-48.51);
        const dz = pos.z - (-74.33);
        const dist = Math.sqrt(dy * dy + dz * dz);
        if (dist < 10) {
          currentScene = "bedroom";
          switchScene(bedroom, "bedroom");
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