// npc.js
import * as THREE from "three";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default class NPCManager {
  constructor(world, scene, character, numNPCs = 3, bounds = { x: 100, z: 100 }) {
    this.world = world;
    this.scene = scene;
    this.character = character;
    this.npcs = [];
    this.loader = new GLTFLoader();
    this.npcSpeed = 1.0; // units per second
    this.modelUrl = "../../assets/models/creepy_teen_girl.glb";
    this.bounds = bounds;

    this.animations = []; // store animations globally
    this.respawnDelay = 4000; // ms before respawn

    // Listen for collisions
    this.world.addEventListener("collision", this.handleCollision.bind(this));

    // Load model and spawn NPCs
    this.loadBaseModel().then((baseModel) => {
      for (let i = 0; i < numNPCs; i++) {
        this.createNPC(baseModel);
      }
    });
  }

  // Load the model once, store animations
  async loadBaseModel() {
    return new Promise((resolve, reject) => {
      this.loader.load(
        this.modelUrl,
        (gltf) => {
          const model = gltf.scene;
          this.animations = gltf.animations || [];
          model.scale.set(1, 1, 1);
          model.visible = false;
          this.scene.add(model);
          resolve(model);
        },
        undefined,
        reject
      );
    });
  }

  createNPC(baseModel) {
    const npcModel = baseModel.clone();
    npcModel.visible = true;

    // Random spawn position
    const spawnX = (Math.random() - 0.5) * this.bounds.x;
    const spawnZ = (Math.random() - 0.5) * this.bounds.z;
    npcModel.position.set(spawnX, 2, spawnZ);

    // Physics setup
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawnX, 2, spawnZ);
    const rigidBody = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3);
    const collider = this.world.createCollider(colliderDesc, rigidBody);
    collider.userData = { type: "npc" };

    // Character controller
    const controller = this.world.createCharacterController(0.01);
    controller.enableSnapToGround(0.5);
    controller.setStepOffset(0.5);
    controller.setMaxSlopeClimbAngle(Math.PI / 4);
    controller.setMinSlideAngle(Math.PI / 6);

    // Animation setup
    const mixer = new THREE.AnimationMixer(npcModel);
    let walkClip =
      this.animations.find((clip) => clip.name.toLowerCase().includes("walk")) ||
      this.animations[0];
    let walkAction = null;
    if (walkClip) {
      walkAction = mixer.clipAction(walkClip);
      walkAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    // Add to scene
    this.scene.add(npcModel);

    const npc = {
      model: npcModel,
      rigidBody,
      collider,
      controller,
      mixer,
      walkAction,
      lastPosition: npcModel.position.clone(),
      isMoving: false,
      alive: true,
    };

    this.npcs.push(npc);
  }

  update(delta) {
    this.npcs.forEach((npc) => {
      if (!npc.alive || !this.character.model) return;

      // Chase player
      const playerPos = this.character.model.position;
      const npcPos = npc.model.position;
      const direction = new THREE.Vector3().subVectors(playerPos, npcPos).normalize();

      // Move horizontally toward player
      const movement = new RAPIER.Vector3(
        direction.x * this.npcSpeed * delta,
        0,
        direction.z * this.npcSpeed * delta
      );

      npc.controller.computeColliderMovement(npc.collider, movement);
      const nextPos = npc.rigidBody.translation().add(npc.controller.computedMovement());
      npc.rigidBody.setNextKinematicTranslation(nextPos);
      npc.model.position.copy(nextPos);

      // Rotate toward player (Y only)
      npc.model.lookAt(playerPos);
      npc.model.rotation.x = 0;
      npc.model.rotation.z = 0;

      // Animation control
      const movedDistance = npc.model.position.distanceTo(npc.lastPosition);
      if (movedDistance > 0.01) {
        if (npc.walkAction && !npc.isMoving) {
          npc.walkAction.play();
          npc.isMoving = true;
        }
      } else {
        if (npc.walkAction && npc.isMoving) {
          npc.walkAction.stop();
          npc.isMoving = false;
        }
      }
      npc.lastPosition.copy(npc.model.position);

      // Update animation mixer
      npc.mixer.update(delta);
    });
  }

  handleCollision(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const c1 = pair.collider1();
      const c2 = pair.collider2();

      if (
        (c1.userData?.type === "npc" && c2.userData?.type === "character") ||
        (c2.userData?.type === "npc" && c1.userData?.type === "character")
      ) {
        console.log("Player caught! Respawning NPC...");
        const npc = this.npcs.find((n) => n.collider === c1 || n.collider === c2);
        if (npc) this.killAndRespawnNPC(npc);
      }
    }
  }

  // Kill and respawn after delay
  killAndRespawnNPC(npc) {
    if (!npc.alive) return;
    npc.alive = false;

    // Remove model & body
    this.scene.remove(npc.model);
    this.world.removeRigidBody(npc.rigidBody);
    this.world.removeCollider(npc.collider);

    // Respawn later
    setTimeout(() => {
      const spawnX = (Math.random() - 0.5) * this.bounds.x;
      const spawnZ = (Math.random() - 0.5) * this.bounds.z;
      npc.model.position.set(spawnX, 2, spawnZ);

      const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawnX, 2, spawnZ);
      npc.rigidBody = this.world.createRigidBody(bodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3);
      npc.collider = this.world.createCollider(colliderDesc, npc.rigidBody);
      npc.collider.userData = { type: "npc" };

      this.scene.add(npc.model);
      npc.alive = true;
    }, this.respawnDelay);
  }

  dispose() {
    this.npcs.forEach((npc) => {
      if (npc.model) {
        npc.model.traverse((child) => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        this.scene.remove(npc.model);
      }
      if (npc.rigidBody) this.world.removeRigidBody(npc.rigidBody);
      if (npc.collider) this.world.removeCollider(npc.collider);
      if (npc.controller) this.world.removeCharacterController(npc.controller);
    });
    this.npcs = [];
  }
}
