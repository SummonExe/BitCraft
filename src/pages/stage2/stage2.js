import { 
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, 
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, 
  AmbientLight, Vector3, Quaternion, Color, AnimationMixer, Box3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from '../../../public/character/undercover_cop/character_2.js';
import MiniMap from "../../MiniMap.js";

import FlashingModel from "../../../public/models/arrow.glb";
import DoorModel from "../../../public/models/door_wood.glb";
import Coin from "../../../public/models/holy_water.glb";
import NPCModel from "../../../src/assets/models/creepy_teen_girl.glb";

import Outside from "../../../public/models/theMansion/the_mansion.compressed.glb"; 
import Building from "../../../public/models/maze_room.glb";
import bedroom from "../../../public/models/hill_room.glb";


let clock = new Clock();
let world;
let currentScene = "mansion";
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

  // character - will be positioned properly after scene loads
  const character = new Character(world, scene, { x: 1, y: 2, z: 116 });
  const cameraOffset = new Vector3(0, 3, -6);
  const lookAtOffset = new Vector3(0, 1.5, 0);

  // bookkeeping
  let activeColliders = [];
  let activeBuildingRoots = [];
  let flashingObjects = [];
  let doorMixers = [];
  let coins = [];
  let npcs = [];
  let score = 0;
  let scoreElement;

  const loader = new GLTFLoader();
  
  // Setup Draco decoder for compressed models
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  loader.setDRACOLoader(dracoLoader);

  // --------------------------
  // GROUND COLLIDER
  // --------------------------
  function createGroundCollider(yPosition) {
    // Only create ground collider for maze scene
    // Mansion and bedroom use their actual mesh geometry for ground
    if (currentScene === "maze") {
      if (groundCollider) {
        world.removeCollider(groundCollider, true);
        groundCollider = null;
      }
      const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, yPosition, 0);
      const groundBody = world.createRigidBody(groundDesc);
      groundCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(125, 0.1, 125), groundBody);
    } else {
      // Remove ground collider for mansion/bedroom
      if (groundCollider) {
        world.removeCollider(groundCollider, true);
        groundCollider = null;
      }
    }
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
        } else if (name === "mansion") {
          building.position.y = 2;
          building.scale.set(3, 3, 3);
        } else {
          building.position.y = -50;
          building.scale.set(1, 1, 1);
        }
        if (targetScale) building.scale.copy(targetScale);
        
        // Create ground collider after setting position
        createGroundCollider(name === "maze_room" ? -50 : 0);

        scene.add(building);
        activeBuildingRoots.push(building);
        building.updateMatrixWorld(true);

        const bbox = new Box3().setFromObject(building);
        const size = new Vector3();
        bbox.getSize(size);

        building.traverse((child) => {
          if (child.isMesh && child.geometry) {
            // Skip physics for trees, grass, foliage, leaves, plants
            const meshName = child.name.toLowerCase();
            if (meshName.includes('outsideobjects') || 
                meshName.includes('glass') || 
                meshName.includes('yard_78_m_0') || 
                meshName.includes('yard_56_m_0') ||
                meshName.includes('yard_58_m_0')) {
              // console.log("Skipping collider for vegetation:", child.name);
              return;
            }
            
            try {
              const geometry = child.geometry.clone();
              geometry.applyMatrix4(child.matrixWorld);
              const posAttr = geometry.attributes.position;
              if (!posAttr) {
                console.warn("No position attribute for mesh:", child.name);
                return;
              }
              const vertices = new Float32Array(posAttr.array.slice(0));
              const indices = geometry.index ? new Uint32Array(geometry.index.array.slice(0)) : null;
              
              if (!indices) {
                console.warn("No indices for mesh:", child.name, "- skipping");
                geometry.dispose?.();
                return;
              }
              
              const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
              const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
              const rigidBody = world.createRigidBody(rigidBodyDesc);
              const collider = world.createCollider(colliderDesc, rigidBody);
              activeColliders.push(collider);
              // console.log("Created collider for:", child.name, "vertices:", vertices.length / 3, "triangles:", indices.length / 3);
              geometry.dispose?.();
            } catch (err) {
              console.error("Failed to create collider for mesh:", child.name, err);
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

    const currentPos = character.rigidBody.translation();
    
    // Cast a ray downward to detect the ground
    const ray = new RAPIER.Ray(
      { x: currentPos.x, y: currentPos.y + 1, z: currentPos.z }, // Start ray from character center
      { x: 0, y: -1, z: 0 }
    );
    const maxToi = 10.0; // Check down
    const hit = world.castRay(ray, maxToi, true);

    if (hit) {
      const groundY = (currentPos.y + 1) - hit.toi; // Calculate actual ground Y
      const targetY = groundY + 0.1; // Small offset so feet are just above ground
      
      // Smoothly move character to ground
      if (Math.abs(currentPos.y - targetY) > 0.05) {
        const newY = currentPos.y + (targetY - currentPos.y) * Math.min(delta * 15, 1);
        character.rigidBody.setTranslation(
          {
            x: currentPos.x,
            y: newY,
            z: currentPos.z
          },
          true
        );
      }
    } else {
      // No ground detected, apply gravity
      character.rigidBody.setTranslation(
        {
          x: currentPos.x,
          y: currentPos.y - 9.81 * delta,
          z: currentPos.z
        },
        true
      );
    }
  }

  // --------------------------
  // NPC SYSTEM
  // --------------------------
  function loadNPC(url, startPosition) {
    loader.load(url, (gltf) => {
      const npc = gltf.scene;
      npc.position.copy(startPosition);
      npc.scale.set(2.5, 2.5, 2.5);
      npc.rotation.y = 0;
      
      scene.add(npc);
      activeBuildingRoots.push(npc);
      
      // Setup animation if available
      let mixer = null;
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new AnimationMixer(npc);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }
      
      const npcData = {
        model: npc,
        mixer: mixer,
        speed: 3, // Chasing speed
        detectionRadius: 50.0, // How far they can detect the player
        active: false // Whether they're currently chasing
      };
      
      npcs.push(npcData);
      console.log("NPC loaded at position:", startPosition);
    }, undefined, (err) => console.error("Failed to load NPC:", err));
  }

  function updateNPCs(delta, playerPos) {
    if (!playerPos || currentScene !== "mansion") return;
    
    for (const npc of npcs) {
      if (npc.mixer) {
        npc.mixer.update(delta);
      }
      
      // Calculate distance to player (2D distance, ignoring Y)
      const dx = playerPos.x - npc.model.position.x;
      const dz = playerPos.z - npc.model.position.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      
      // Activate if player is within detection radius
      if (distToPlayer < npc.detectionRadius) {
        npc.active = true;
      }
      
      // Chase the player if active
      if (npc.active && distToPlayer > 1.0) {
        // Normalize direction
        const dirX = dx / distToPlayer;
        const dirZ = dz / distToPlayer;
        
        // Move towards player
        npc.model.position.x += dirX * npc.speed * delta;

        npc.model.position.z += dirZ * npc.speed * delta;
        
        // Keep NPC at same Y level as player for ground following
        npc.model.position.y = 2;
        
        // Rotate to face player
        npc.model.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  // Check collision between character and NPCs
  function checkNPCCollisions(characterPos) {
    if (currentScene !== "mansion") return false;
    
    for (const npc of npcs) {
      const dx = characterPos.x - npc.model.position.x;
      const dz = characterPos.z - npc.model.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      // Collision distance threshold
      if (dist < 1.5) {
        return true; // Collision detected
      }
    }
    return false;
  }

  // --------------------------
  // GAME OVER SYSTEM
  // --------------------------
  let isGameOver = false;
  
  function showGameOver() {
    isGameOver = true;
    character.canMove = () => false;
    
    // Create game over screen
    const gameOverDiv = document.createElement("div");
    gameOverDiv.style.position = "absolute";
    gameOverDiv.style.top = "50%";
    gameOverDiv.style.left = "50%";
    gameOverDiv.style.transform = "translate(-50%, -50%)";
    gameOverDiv.style.padding = "40px 60px";
    gameOverDiv.style.background = "rgba(139, 0, 0, 0.95)";
    gameOverDiv.style.border = "3px solid #ff0000";
    gameOverDiv.style.borderRadius = "15px";
    gameOverDiv.style.color = "#fff";
    gameOverDiv.style.fontSize = "48px";
    gameOverDiv.style.fontWeight = "bold";
    gameOverDiv.style.textAlign = "center";
    gameOverDiv.style.zIndex = "1000";
    gameOverDiv.innerHTML = `
      <div style="margin-bottom: 20px;">YOU DIED</div>
      <div style="font-size: 20px; margin-bottom: 30px;">The creature caught you...</div>
      <button id="restart-btn" style="
        padding: 15px 40px;
        font-size: 24px;
        background: #ff0000;
        color: white;
        border: 2px solid #fff;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
      ">Restart</button>
    `;
    document.body.appendChild(gameOverDiv);
    
    // Add restart functionality
    document.getElementById("restart-btn").addEventListener("click", () => {
      location.reload();
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
    npcs.length = 0; // Clear NPCs when switching scenes
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
    const yPosition = (name === "bedroom" || name === "mansion") ? 0 : -50;
    mazeSize = await loadBuilding(filePath, new Vector3(0, yPosition, 0), name, targetScale);

    // Set initial position - mansion spawns at (1, 2, 116)
    let startX = 0;
    let startY = 2;
    let startZ = 0;
    
    character.rigidBody.setTranslation({ x: startX, y: startY, z: startZ }, true);
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
    mazeSize = await loadBuilding(Outside, new Vector3(0, 0, 0), "mansion");
  }

  // Load mansion-specific objects (will be cleaned up when switching scenes)
  async function loadMansionObjects() {
    // Load 4 NPCs at different positions around the yard
    const npcPositions = [
      new Vector3(-8, 2, 10),
      new Vector3(12, 2, 8),
      new Vector3(5, 2, 20),
      new Vector3(-3, 2, 15)
    ];
    
    for (const pos of npcPositions) {
      loadNPC(NPCModel, pos);
    }
  }

  // Load maze-specific objects (will be loaded when switching to maze)
  async function loadMazeObjects() {
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, -46.07));
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, 30.00));
    loadDoorModel(DoorModel, new Vector3(-28.28, -48.51, -74.33));
    loadCoin(Coin, new Vector3(-35, -21, -145));
    loadCoin(Coin, new Vector3(-45, 2, -65));
    loadCoin(Coin, new Vector3(-30, 2, 25));
    loadCoin(Coin, new Vector3(24, 2, 25));

    loadNPC(NPCModel, new Vector3(-45.78, 3, -46.07));
    loadNPC(NPCModel, new Vector3(-45.78, 0.60, 30.00));

  }

  await loadInitialScene();
  await loadMansionObjects();
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
    if (!isSwitching && !isGameOver) {
      world.step();
      // Update character controller with stair-stepping parameters
      if (character.controller) {
        character.controller.enableSnapToGround(0.5);
        character.controller.setMaxSlopeClimbAngle(Math.PI / 4);
        character.controller.setMinSlideAngle(Math.PI / 6);
        character.controller.setStepOffset(0.5);
      }
      character.update(delta);
      snapToGround(character, character.controller, delta);
      updateFlashing(delta);
      updateDoors(delta);
      
      // Update NPCs with player position
      if (character.model) {
        updateNPCs(delta, character.model.position);
      }
    }
    updateCamera(delta);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, camera);

    if (character.model && !isGameOver) {
      character.model.scale.set(1.5, 1.5, 1.5);
      const pos = character.model.position;

      // console.log(pos.x, pos.y, pos.z);

      // Check for NPC collisions first
      if (checkNPCCollisions(pos)) {
        showGameOver();
        return;
      }

      if (miniMap) miniMap.update(pos);
      updateCoins(delta, pos);

      if (currentScene === "mansion") {
        // Trigger when character reaches door position
        const dx = pos.x - (2.5);
        const dz = pos.z - (3.5);
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 2) {
          currentScene = "maze";
          switchScene(Building, "maze_room").then(() => {
            loadMazeObjects();
          });
        }
      } else if (currentScene === "maze") {
        const dx = pos.x - (-25.45);
        const dz = pos.z - (-74.33);
        const dist = Math.sqrt(dx * dx + dz * dz);
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
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

init();