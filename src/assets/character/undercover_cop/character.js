import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export default class Character {
  constructor(world, scene, position) {
    this.scene = scene;
    this.position = position;
    this.world = world;
    this.isMoving = false;
    this.mixer = null;
    this.moveRate = 0.25;
    this.animations = {};
    this.currentAction = null;

    const loader = new GLTFLoader();
    loader.load('/src/assets/character/undercover_cop/undercover_cop_-_animated.glb', (gltf) => {
      this.model = gltf.scene;
      // console.log('Loaded model:', this.model);
      this.model.position.copy(position);
      this.model.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
      });
      scene.add(this.model);

      // Physics setup
      const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic).setTranslation(0, 2, 0);
      this.rigidBody = world.createRigidBody(rigidBodyDesc);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 1, 0.5);
      world.createCollider(colliderDesc, this.rigidBody);

      // Temporary ground collider
      const groundBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed).setTranslation(0, 0, 0);
      const groundBody = world.createRigidBody(groundBodyDesc);
      const groundColliderDesc = RAPIER.ColliderDesc.cuboid(125, 0.1, 125);
      world.createCollider(groundColliderDesc, groundBody);

      // Animation setup with debugging
      this.mixer = new THREE.AnimationMixer(this.model);
      if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach((clip) => {
          this.animations[clip.name] = clip;
          // console.log('Available animation:', clip.name);
        });
      } else {
        console.warn('No animations found in GLTF file');
      }

      // Start with Breathing Idle if available
      if (this.animations['Breathing Idle']) {
        this.currentAction = this.mixer.clipAction(this.animations['Breathing Idle']);
        this.currentAction.setLoop(THREE.LoopRepeat);
        this.currentAction.play();
      } else {
        console.warn('Breathing Idle animation not found');
      }
    }, undefined, (error) => {
      console.error('GLTF loading error:', error);
    });

    // Controls setup
    this.keys = {};
    this.targetRotation = 0;
    document.addEventListener('keydown', (e) => this.keys[e.key] = true);
    document.addEventListener('keyup', (e) => this.keys[e.key] = false);
  }

  update(delta) {
    // Basic physics update
    if (this.rigidBody) {
      const position = this.rigidBody.translation();
      this.model.position.set(position.x, position.y, position.z);
    }

    // Control logic with movement detection and rotation
    this.isMoving = false;
    let rotationSpeed = 5 * delta;

    if (this.rigidBody) {
      if (this.keys['w'] || this.keys['ArrowUp']) {
        this.rigidBody.applyImpulse({ x: 0, y: 0, z: this.moveRate }, true);
        this.isMoving = true;
        this.targetRotation = 0;
      }
      if (this.keys['s'] || this.keys['ArrowDown']) {
        this.rigidBody.applyImpulse({ x: 0, y: 0, z: -this.moveRate }, true);
        this.isMoving = true;
        this.targetRotation = Math.PI;
      }
      if (this.keys['a'] || this.keys['ArrowLeft']) {
        this.rigidBody.applyImpulse({ x: this.moveRate, y: 0, z: 0 }, true);
        this.isMoving = true;
        this.targetRotation = Math.PI / 2;
      }
      if (this.keys['d'] || this.keys['ArrowRight']) {
        this.rigidBody.applyImpulse({ x: -this.moveRate, y: 0, z: 0 }, true);
        this.isMoving = true;
        this.targetRotation = -Math.PI / 2;
      }

      // Stop gliding when no keys are pressed
      if (!this.isMoving && this.rigidBody) {
        const linvel = this.rigidBody.linvel();
        if (Math.abs(linvel.x) > 0.01 || Math.abs(linvel.z) > 0.01) {
          this.rigidBody.setLinvel({ x: linvel.x * 0.9, y: linvel.y, z: linvel.z * 0.9 }, true); // Dampen velocity
        } else {
          this.rigidBody.setLinvel({ x: 0, y: linvel.y, z: 0 }, true); // Stop completely if near zero
        }
      }

      // Smoothly interpolate rotation
      if (this.model) {
        const currentRotation = this.model.rotation.y;
        const difference = this.targetRotation - currentRotation;
        const shortestAngle = ((difference + Math.PI) % (2 * Math.PI)) - Math.PI;
        this.model.rotation.y += shortestAngle * rotationSpeed;
      }
    }

    // Animation logic with improved transitions
    if (this.mixer) {
      if (this.isMoving && this.animations['walking']) {
        if (!this.currentAction || this.currentAction.getClip().name !== 'walking') {
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          this.currentAction = this.mixer.clipAction(this.animations['walking']);
          this.currentAction.setLoop(THREE.LoopRepeat);
          this.currentAction.reset().play();
          this.currentAction.fadeIn(0.2);
        }
      } else if (!this.isMoving && this.animations['Breathing Idle']) {
        if (!this.currentAction || this.currentAction.getClip().name !== 'Breathing Idle') {
          if (this.currentAction) this.currentAction.fadeOut(0.2);
          this.currentAction = this.mixer.clipAction(this.animations['Breathing Idle']);
          this.currentAction.setLoop(THREE.LoopRepeat);
          this.currentAction.reset().play();
          this.currentAction.fadeIn(0.2);
        }
      }
      this.mixer.update(delta);
    }
  }
}