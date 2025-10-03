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

    this.rotationY = 0;
    this.rotationSpeed = Math.PI;

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
      const groundColliderDesc = RAPIER.ColliderDesc.cuboid(5000, 0.1, 5000);
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
    document.addEventListener('keydown', (e) => { this.keys[e.key] = true; });
    document.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
  }

  update(delta) {
    this.isMoving = false;

    if (this.keys['a'] || this.keys['ArrowLeft']) {
      this.rotationY += this.rotationSpeed * delta;
    }
    if (this.keys['d'] || this.keys['ArrowRight']) {
      this.rotationY -= this.rotationSpeed * delta;
    }

    if (this.model) {
      this.model.rotation.y = this.rotationY;
    }

    if (this.rigidBody) {
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);

      if (this.keys['w'] || this.keys['ArrowUp']) {
        this.rigidBody.applyImpulse({ x: forward.x * this.moveRate, y: 0, z: forward.z * this.moveRate }, true);
        this.isMoving = true;
      }
      if (this.keys['s'] || this.keys['ArrowDown']) {
        this.rigidBody.applyImpulse({ x: -forward.x * this.moveRate, y: 0, z: -forward.z * this.moveRate }, true);
        this.isMoving = true;
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
    }

    // Sync model with physics
    if (this.rigidBody && this.model) {
      const pos = this.rigidBody.translation();
      this.model.position.set(pos.x, pos.y - 1, pos.z); // Adjust y if needed for model offset
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