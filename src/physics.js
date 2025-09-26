import RAPIER from '@dimforge/rapier3d-compat';

let world = null;

async function initPhysics() {
  await RAPIER.init();
  const gravity = { x: 0, y: -9.82, z: 0 }; // Earth-like gravity
  world = new RAPIER.World(gravity);

  // Add static ground plane
  const groundBodyDesc = RAPIER.RigidBodyDesc.newStatic().setTranslation(0, 0, 0);
  const groundBody = world.createRigidBody(groundBodyDesc);
  const groundShape = RAPIER.ColliderDesc.cuboid(50, 0.1, 50); // Large, thin box
  world.createCollider(groundShape, groundBody);

  console.log('Physics world and ground initialized');
}

export { initPhysics, world };