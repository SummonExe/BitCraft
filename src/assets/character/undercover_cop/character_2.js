import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import copModel from "./undercover_cop_-_animated.glb";

export default class Character {
  constructor(world, scene, position) {
    this.scene = scene;
    this.position = position;
    this.world = world;

    this.isMoving = false;
    this.isRunning = false; // Track running state
    this.mixer = null;
    this.moveRate = 0.5; // Walking speed
    this.runRate = 1; // Running speed (faster than walking)
    this.animations = {};
    this.currentAction = null;

    this.rotationY = 0;
    this.rotationSpeed = Math.PI;

    const loader = new GLTFLoader();
    loader.load(
      copModel,
      (gltf) => {
        this.model = gltf.scene;
        this.model.position.copy(position);

        this.model.traverse((child) => {
          if (child.isMesh) child.castShadow = true;
        });

        scene.add(this.model);

        // --- Physics setup ---
        const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
          .setTranslation(position.x, position.y, position.z);
        this.rigidBody = world.createRigidBody(rigidBodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 1, 0.5);
        world.createCollider(colliderDesc, this.rigidBody);

        this.rigidBody.setLinearDamping(4.0);
        this.rigidBody.setAngularDamping(4.0);

        // Animation setup
        this.mixer = new THREE.AnimationMixer(this.model);
        if (gltf.animations && gltf.animations.length > 0) {
          gltf.animations.forEach((clip) => {
            this.animations[clip.name] = clip;
          });
        }

        // Default idle animation
        if (this.animations['Breathing Idle']) {
          this.currentAction = this.mixer.clipAction(this.animations['Breathing Idle']);
          this.currentAction.setLoop(THREE.LoopRepeat);
          this.currentAction.play();
        }
      },
      undefined,
      (error) => {
        console.error('GLTF loading error:', error);
      }
    );

    // Input handling
    this.keys = {};
    document.addEventListener('keydown', (e) => (this.keys[e.key.toLowerCase()] = true));
    document.addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));
  }

  update(delta) {
    if (!this.rigidBody || !this.model) return;

    this.isMoving = false;
    this.isRunning = false;

    // --- ROTATION ---
    if (this.keys['a'] || this.keys['arrowleft']) {
      this.rotationY += this.rotationSpeed * delta;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      this.rotationY -= this.rotationSpeed * delta;
    }
    this.model.rotation.y = this.rotationY;

    // --- MOVEMENT ---
    let forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    const linvel = this.rigidBody.linvel();

    let moveX = 0;
    let moveZ = 0;
    let speed = this.moveRate; // Default to walking speed

    // Check if Shift is held for running
    if (this.keys['shift']) {
      this.isRunning = true;
      speed = this.runRate; // Use running speed
    }

    if (this.keys['w'] || this.keys['arrowup']) {
      moveX += forward.x * speed;
      moveZ += forward.z * speed;
      this.isMoving = true;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      moveX -= forward.x * speed;
      moveZ -= forward.z * speed;
      this.isMoving = true;
    }

    if (this.isMoving) {
      this.rigidBody.setLinvel(
        { x: moveX * 15, y: linvel.y, z: moveZ * 15 },
        true
      );
    } else {
      this.rigidBody.setLinvel(
        { x: linvel.x * 0.5, y: linvel.y, z: linvel.z * 0.5 },
        true
      );

      if (Math.abs(linvel.x) < 0.05 && Math.abs(linvel.z) < 0.05) {
        this.rigidBody.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);
      }
    }

    // --- SYNC MODEL POSITION ---
    const pos = this.rigidBody.translation();
    this.model.position.set(pos.x, pos.y, pos.z);

    // --- ANIMATIONS ---
    if (this.mixer) {
      if (this.isMoving) {
        let targetAnimation = this.isRunning && this.animations['running'] ? 'running' : 'walking';
        let animationSpeed = this.isRunning ? 1.5 : 1.0; // Speed up walking animation if no running animation

        if (!this.currentAction || this.currentAction.getClip().name !== targetAnimation) {
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          this.currentAction = this.mixer.clipAction(this.animations[targetAnimation] || this.animations['walking']);
          this.currentAction.setLoop(THREE.LoopRepeat);
          this.currentAction.reset().play();
          this.currentAction.fadeIn(0.2);
        }
        this.currentAction.timeScale = animationSpeed; // Adjust animation speed for running
      } else if (this.animations['Breathing Idle']) {
        if (!this.currentAction || this.currentAction.getClip().name !== 'Breathing Idle') {
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          this.currentAction = this.mixer.clipAction(this.animations['Breathing Idle']);
          this.currentAction.setLoop(THREE.LoopRepeat);
          this.currentAction.reset().play();
          this.currentAction.fadeIn(0.2);
        }
        this.currentAction.timeScale = 1.0; // Reset to normal speed for idle
      }
      this.mixer.update(delta);
    }
  }
}