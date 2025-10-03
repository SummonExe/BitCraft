import { 
  Clock, Scene, PerspectiveCamera, WebGLRenderer, Mesh, 
  PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, 
  AmbientLight, Vector3, SphereGeometry, MeshBasicMaterial, Quaternion 
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Character from '../../assets/character/undercover_cop/character.js';

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
  const groundTexture = textureLoader.load('/src/assets/textures/Cobblestone.png');
  const groundMaterial = new MeshStandardMaterial({ map: groundTexture, side: DoubleSide });
  const groundGeometry = new PlaneGeometry(250, 250);
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const light = new AmbientLight(0xffffff, 1);
  scene.add(light);

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  {
    const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
    const groundBody = world.createRigidBody(groundDesc);
    const groundCollider = RAPIER.ColliderDesc.cuboid(125, 0.1, 125);
    world.createCollider(groundCollider, groundBody);
  }

  const character = new Character(world, scene, { x: 0, y: 2, z: 0 });

  const cameraOffset = new Vector3(0, 3, -6);
  const lookAtOffset = new Vector3(0, 1.5, 0);

  const loader = new GLTFLoader();

  let secondStairsStartPosition = null;
  let secondStairsStartRotationY = 0;

  function loadBuilding(url, positionOffset, onLoaded) {
    loader.load(url, (gltf) => {
      const building = gltf.scene;
      building.position.copy(positionOffset);
      building.scale.set(1, 1, 1);
      scene.add(building);

      building.updateMatrixWorld(true);

      let lowestStairY = Infinity;

      building.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.castShadow = true;
          child.receiveShadow = true;

          const geometry = child.geometry.clone();
          geometry.applyMatrix4(child.matrixWorld);

          const vertices = geometry.attributes.position.array;
          const indices = geometry.index ? geometry.index.array : null;

          if (!indices) return;

          const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
          const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
          const rigidBody = world.createRigidBody(rigidBodyDesc);
          world.createCollider(colliderDesc, rigidBody);

          if (child.name.toLowerCase().includes("stairs")) {
            child.geometry.computeBoundingBox();
            const bbox = child.geometry.boundingBox;
            const min = bbox.min.clone();
            child.localToWorld(min);

            if (min.y < lowestStairY) {
              lowestStairY = min.y;
              secondStairsStartPosition = min.clone();

              const stairDir = new Vector3(0, 0, 1);
              const quat = new Quaternion();
              child.getWorldQuaternion(quat);
              stairDir.applyQuaternion(quat);
              secondStairsStartRotationY = Math.atan2(stairDir.x, stairDir.z);
            }
          }
        }
      });

      if (onLoaded && secondStairsStartPosition) {
        const curtainHeight = 3;
        const curtainWidth = 2;
        const curtainGeometry = new PlaneGeometry(curtainWidth, curtainHeight);
        const curtainMaterial = new MeshStandardMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0.5,
          side: DoubleSide,
          emissive: 0x00ff00,
          emissiveIntensity: 0.5
        });

        const curtain = new Mesh(curtainGeometry, curtainMaterial);
        curtain.position.copy(secondStairsStartPosition);
        curtain.position.y += curtainHeight / 2;
        curtain.rotation.y = secondStairsStartRotationY;
        scene.add(curtain);

        const sphereGeom = new SphereGeometry(0.1, 16, 16);
        const sphereMat = new MeshBasicMaterial({ color: 0xff0000 });
        const debugSphere = new Mesh(sphereGeom, sphereMat);
        debugSphere.position.copy(secondStairsStartPosition);
        scene.add(debugSphere);

        const triggerBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
          curtain.position.x,
          curtain.position.y,
          curtain.position.z
        );
        const triggerBody = world.createRigidBody(triggerBodyDesc);

        const triggerCollider = RAPIER.ColliderDesc.cuboid(curtainWidth / 2, curtainHeight / 2, 0.1).setSensor(true);
        world.createCollider(triggerCollider, triggerBody);

        world.onCollision((event) => {
          const collider1 = event.collider1;
          const collider2 = event.collider2;

          if ((collider1 === triggerCollider || collider2 === triggerCollider) &&
              (collider1 === character.collider || collider2 === character.collider)) {
            console.log("Curtain trigger reached! Loading room...");
            loadBuilding('../../assets/models/room.glb', new Vector3(0, 0, 0));
            character.body.setTranslation({ x: 0, y: 2, z: 0 });
          }
        });
      }
    });
  }

  loadBuilding('../../assets/models/maze_room.glb', new Vector3(0, -50, 0), true);

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
    world.step();
    character.update(delta);
    updateCamera(delta);
    renderer.render(scene, camera);
  }
}

init();
