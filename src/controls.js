function setupCameraControls(camera) {
  const keys = {};
  const moveSpeed = 0.1;

  document.addEventListener('keydown', (event) => {
    keys[event.key.toLowerCase()] = true;
  });
  document.addEventListener('keyup', (event) => {
    keys[event.key.toLowerCase()] = false;
  });

  function update() {
    if (keys['w']) camera.position.z -= moveSpeed;
    if (keys['s']) camera.position.z += moveSpeed;
    if (keys['a']) camera.position.x -= moveSpeed;
    if (keys['d']) camera.position.x += moveSpeed;
    if (keys['q']) camera.position.y += moveSpeed; // Up
    if (keys['e']) camera.position.y -= moveSpeed; // Down
  }

  return { update };
}

export { setupCameraControls };