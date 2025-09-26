import RAPIER from '@dimforge/rapier3d-compat';

let world = null;

async function initPhysics() {
  await RAPIER.init();
  const gravity = { x: 0, y: -9.82, z: 0 }; // Earth-like gravity
  world = new RAPIER.World(gravity);
  console.log('Physics world initialized');
}

export { initPhysics, world };