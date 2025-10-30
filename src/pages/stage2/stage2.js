import { 
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, 
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, 
  AmbientLight, Vector3, Quaternion, Color, AnimationMixer, Box3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
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
import kid from "../../../public/models/kid2/Idle.fbx";

// === LOADING SCREEN ===
const loadingScreen = document.getElementById('loadingScreen');
if (!loadingScreen) {
  console.error("Loading screen element not found!");
}

// === GLOBAL STATE ===
let clock = new Clock();
let world;
let currentScene = "mansion";
let mazeSize = null;
let isSwitching = false;
let groundCollider = null;
let loadingComplete = false;
let isPaused = false;
let bedroomReached = false;
let bedroomReachTime = null;
const BEDROOM_WIN_DELAY = 3000; // 3 seconds

let scene, camera, renderer, character;
let activeColliders = [];
let activeBuildingRoots = [];
let flashingObjects = [];
let doorMixers = [];
let coins = [];
let npcs = [];
let kidModel = null;
let score = 0;
let scoreElement;
let miniMap = null;
let isGameOver = false;

const cameraOffset = new Vector3(0, 3, -6);
const lookAtOffset = new Vector3(0, 1.5, 0);

// Create Pause Menu
const pauseMenu = document.createElement('div');
pauseMenu.style.position = 'absolute';
pauseMenu.style.top = '50%';
pauseMenu.style.left = '50%';
pauseMenu.style.transform = 'translate(-50%, -50%)';
pauseMenu.style.padding = '40px 60px';
pauseMenu.style.background = 'rgba(0, 0, 0, 0.95)';
pauseMenu.style.border = '3px solid #ffffff';
pauseMenu.style.borderRadius = '15px';
pauseMenu.style.color = '#fff';
pauseMenu.style.textAlign = 'center';
pauseMenu.style.zIndex = '2000';
pauseMenu.style.display = 'none';
pauseMenu.innerHTML = `
  <div style="font-size: 48px; margin-bottom: 30px;">PAUSED</div>
  <button id="resume-btn" style="
    padding: 15px 40px;
    font-size: 24px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin: 10px;
    width: 200px;
  ">Resume</button>
  <br>
  <button id="pause-menu-btn" style="
    padding: 15px 40px;
    font-size: 24px;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin: 10px;
    width: 200px;
  ">Main Menu</button>
  <div style="margin-top: 30px; font-size: 16px; color: #aaa;">Press ESC to resume</div>
`;
document.body.appendChild(pauseMenu);

// Pause menu event listeners
document.getElementById('resume-btn').addEventListener('click', () => {
  togglePause();
});

document.getElementById('pause-menu-btn').addEventListener('click', () => {
  window.location.href = '/';
});

// Function to toggle pause
function togglePause() {
  isPaused = !isPaused;
  pauseMenu.style.display = isPaused ? 'block' : 'none';
  
  if (isPaused) {
    console.log('Game paused');
  } else {
    console.log('Game resumed');
  }
}

// Input handling for pause
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !isGameOver && loadingComplete) {
    togglePause();
  }
});

async function init() {
  await RAPIER.init();

  scene = new Scene();
  camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  // physics world
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // character
  character = new Character(world, scene, { x: 1, y: 2, z: 116 });

  const loader = new GLTFLoader();
  const fbxLoader = new FBXLoader();
  
  // Setup Draco decoder for compressed models
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  loader.setDRACOLoader(dracoLoader);

  // --------------------------
  // GROUND COLLIDER
  // --------------------------
  function createGroundCollider(yPosition) {
    if (currentScene === "maze") {
      if (groundCollider) {
        world.removeCollider(groundCollider, true);
        groundCollider = null;
      }
      const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, yPosition, 0);
      const groundBody = world.createRigidBody(groundDesc);
      groundCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(125, 0.1, 125), groundBody);
    } else {
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
        
        createGroundCollider(name === "maze_room" ? -50 : 0);

        scene.add(building);
        activeBuildingRoots.push(building);
        building.updateMatrixWorld(true);

        const bbox = new Box3().setFromObject(building);
        const size = new Vector3();
        bbox.getSize(size);

        building.traverse((child) => {
          if (child.isMesh && child.geometry) {
            const meshName = child.name.toLowerCase();
            if (meshName.includes('outsideobjects') || 
                meshName.includes('glass') || 
                meshName.includes('yard_78_m_0') || 
                meshName.includes('yard_56_m_0') ||
                meshName.includes('yard_58_m_0')) {
              return;
            }
            
            try {
              const geometry = child.geometry.clone();
              geometry.applyMatrix4(child.matrixWorld);
              const posAttr = geometry.attributes.position;
              if (!posAttr) return;
              
              const vertices = new Float32Array(posAttr.array.slice(0));
              const indices = geometry.index ? new Uint32Array(geometry.index.array.slice(0)) : null;
              
              if (!indices) {
                geometry.dispose?.();
                return;
              }
              
              const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
              const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
              const rigidBody = world.createRigidBody(rigidBodyDesc);
              const collider = world.createCollider(colliderDesc, rigidBody);
              activeColliders.push(collider);
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
    
    const ray = new RAPIER.Ray(
      { x: currentPos.x, y: currentPos.y + 1, z: currentPos.z },
      { x: 0, y: -1, z: 0 }
    );
    const maxToi = 10.0;
    const hit = world.castRay(ray, maxToi, true);

    if (hit) {
      const groundY = (currentPos.y + 1) - hit.toi;
      const targetY = groundY + 0.1;
      
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
      
      let mixer = null;
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new AnimationMixer(npc);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }
      
      const npcData = {
        model: npc,
        mixer: mixer,
        speed: 3,
        detectionRadius: 50.0,
        active: false
      };
      
      npcs.push(npcData);
      console.log("NPC loaded at position:", startPosition);
    }, undefined, (err) => console.error("Failed to load NPC:", err));
  }

  function updateNPCs(delta, playerPos) {
    if (!playerPos) return;
    
    for (const npc of npcs) {
      if (npc.mixer) {
        npc.mixer.update(delta);
      }
      
      const dx = playerPos.x - npc.model.position.x;
      const dz = playerPos.z - npc.model.position.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      
      if (distToPlayer < npc.detectionRadius) {
        npc.active = true;
      }
      
      if (npc.active && distToPlayer > 1.0) {
        let dirX = dx / distToPlayer;
        let dirZ = dz / distToPlayer;
        
        for (const otherNpc of npcs) {
          if (otherNpc === npc) continue;
          
          const npcDx = npc.model.position.x - otherNpc.model.position.x;
          const npcDz = npc.model.position.z - otherNpc.model.position.z;
          const npcDist = Math.sqrt(npcDx * npcDx + npcDz * npcDz);
          
          if (npcDist < 3.0 && npcDist > 0.01) {
            const separationForce = 1.5;
            dirX += (npcDx / npcDist) * separationForce;
            dirZ += (npcDz / npcDist) * separationForce;
          }
        }
        
        const magnitude = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (magnitude > 0.01) {
          dirX /= magnitude;
          dirZ /= magnitude;
        }
        
        npc.model.position.x += dirX * npc.speed * delta;
        npc.model.position.z += dirZ * npc.speed * delta;
        
        if (currentScene === "maze") {
          npc.model.position.y = 3
        }
        npc.model.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  function checkNPCCollisions(characterPos) {
    // Check collisions in both mansion and maze scenes
    for (const npc of npcs) {
      const dx = characterPos.x - npc.model.position.x;
      const dy = characterPos.y - npc.model.position.y;
      const dz = characterPos.z - npc.model.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // Collision distance threshold (checking 3D distance now)
      if (dist < 2.5) {
        return true;
      }
    }
    return false;
  }

  // --------------------------
  // GAME OVER SYSTEM
  // --------------------------
  function showGameOver(won = false) {
    isGameOver = true;
    character.canMove = () => false;
    
    const gameOverDiv = document.createElement("div");
    gameOverDiv.style.position = "absolute";
    gameOverDiv.style.top = "50%";
    gameOverDiv.style.left = "50%";
    gameOverDiv.style.transform = "translate(-50%, -50%)";
    gameOverDiv.style.padding = "40px 60px";
    gameOverDiv.style.background = won ? "rgba(0, 139, 0, 0.95)" : "rgba(139, 0, 0, 0.95)";
    gameOverDiv.style.border = won ? "3px solid #00ff00" : "3px solid #ff0000";
    gameOverDiv.style.borderRadius = "15px";
    gameOverDiv.style.color = "#fff";
    gameOverDiv.style.fontSize = "48px";
    gameOverDiv.style.fontWeight = "bold";
    gameOverDiv.style.textAlign = "center";
    gameOverDiv.style.zIndex = "3000";
    
    if (won) {
      gameOverDiv.innerHTML = `
        <div style="margin-bottom: 20px;">🎉 YOU ESCAPED! 🎉</div>
        <div style="font-size: 20px; margin-bottom: 10px;">You made it to safety!</div>
        <div style="font-size: 18px; margin-bottom: 30px;">Holy Water Collected: ${score}</div>
        <button id="next-stage-btn" style="
          padding: 15px 40px;
          font-size: 24px;
          background: #00ff00;
          color: black;
          border: 2px solid #fff;
          border-radius: 8px;
          cursor: pointer;
          margin: 10px;
          font-weight: bold;
        ">Next Stage ➜</button>
        <br>
        <button id="restart-btn" style="
          padding: 15px 40px;
          font-size: 24px;
          background: #4CAF50;
          color: white;
          border: 2px solid #fff;
          border-radius: 8px;
          cursor: pointer;
          margin: 10px;
          font-weight: bold;
        ">Play Again</button>
        <br>
        <button id="menu-btn" style="
          padding: 15px 40px;
          font-size: 24px;
          background: #ff9800;
          color: white;
          border: 2px solid #fff;
          border-radius: 8px;
          cursor: pointer;
          margin: 10px;
          font-weight: bold;
        ">Main Menu</button>
      `;
    } else {
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
          margin: 10px;
          font-weight: bold;
        ">Try Again</button>
        <br>
        <button id="menu-btn" style="
          padding: 15px 40px;
          font-size: 24px;
          background: #ff9800;
          color: white;
          border: 2px solid #fff;
          border-radius: 8px;
          cursor: pointer;
          margin: 10px;
          font-weight: bold;
        ">Main Menu</button>
      `;
    }
    
    document.body.appendChild(gameOverDiv);
    
    const restartBtn = document.getElementById("restart-btn");
    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        location.reload();
      });
    }
    
    const menuBtn = document.getElementById("menu-btn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        window.location.href = '/';
      });
    }
    
    const nextStageBtn = document.getElementById("next-stage-btn");
    if (nextStageBtn) {
      nextStageBtn.addEventListener("click", () => {
        window.location.href = '/src/pages/stage3/stage3.html';
      });
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
    npcs.length = 0;
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
  dialogueBox.style.fontSize = "18px";
  dialogueBox.style.display = "none";
  dialogueBox.style.zIndex = "999";
  document.body.appendChild(dialogueBox);

  const DIALOGUE = [
    { speaker: "Man", text: "You're safe now. I found you just in time. Come on, let's get you out of here. There are people waiting for you." },
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
      bedroomReached = true;
      bedroomReachTime = Date.now();
      
      // Load bedroom specific objects (kid model) - non-blocking
      loadBedroomObjects();
      
      // Allow character to move freely
      character.canMove = () => true;
      
      // Show dialogue without blocking game
      showDialogueSequence(DIALOGUE, 28, () => {
        console.log("Dialogue finished");
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
    try {
      console.log("Starting to load mansion...");
      mazeSize = await loadBuilding(Outside, new Vector3(0, 0, 0), "mansion");
      console.log("Mansion loaded successfully");
    } catch (err) {
      console.error("Failed to load mansion:", err);
      throw err;
    }
  }

  async function loadMansionObjects() {
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

  async function loadMazeObjects() {
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, -46.07));
    loadFlashingModel(FlashingModel, new Vector3(-45.78, 0.60, 30.00));
    loadDoorModel(DoorModel, new Vector3(-28.28, -48.51, -74.33));
    loadCoin(Coin, new Vector3(-35, -21, -145));
    loadCoin(Coin, new Vector3(-45, 2, -65));
    loadCoin(Coin, new Vector3(-30, 2, 25));
    loadCoin(Coin, new Vector3(24, 2, 25));

    loadNPC(NPCModel, new Vector3(-45.78, 3, -46.07));
    loadNPC(NPCModel, new Vector3(-45.78, 3, 30.00));
  }

  // --------------------------
  // GAME INITIALIZATION
  // --------------------------
  async function initGame() {
    try {
      console.log("Starting game initialization...");
      
      await Promise.all([
        loadInitialScene(),
        loadMansionObjects()
      ]);
      
      initMiniMap();
      
      console.log("All assets loaded successfully!");
      loadingComplete = true;
      
      if (loadingScreen) {
        loadingScreen.style.display = 'none';
      }
      
    } catch (error) {
      console.error("Failed to load game assets:", error);
      if (loadingScreen) {
        loadingScreen.innerHTML = `<h2>Loading Failed</h2><p>Please refresh and try again.</p>`;
      }
    }
  }

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
    
    // Don't update game until loading is complete
    if (!loadingComplete) {
      renderer.render(scene, camera);
      return;
    }
    
    // If paused, just render and return
    if (isPaused) {
      renderer.render(scene, camera);
      return;
    }
    
    if (!isSwitching && !isGameOver) {
      world.step();
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

      // Check for win condition in bedroom - simple 3 second timer
      if (bedroomReached && bedroomReachTime) {
        const elapsedTime = Date.now() - bedroomReachTime;
        if (elapsedTime >= BEDROOM_WIN_DELAY) {
          showGameOver(true);
          return;
        }
      }

      // Check for NPC collisions
      if (checkNPCCollisions(pos)) {
        showGameOver(false);
        return;
      }

      if (miniMap) miniMap.update(pos);
      updateCoins(delta, pos);

      if (currentScene === "mansion") {
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
  });

  // Start game initialization
  await initGame();
}

init();