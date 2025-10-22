import {
  PerspectiveCamera,
  Scene,
  Vector3,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
} from "three";

export default class MiniMap {
  constructor(renderer, worldScene, player) {
    this.renderer = renderer;
    this.worldScene = worldScene;
    this.player = player;

    // MiniMap camera — high above world
    this.miniMapCamera = new PerspectiveCamera(75, 1, 0.1, 1000);
    this.miniMapCamera.position.set(0, 200, 0);
    this.miniMapCamera.lookAt(0, 0, 0);

    this.sizePercent = 0.2; // minimap size as % of screen
    this.padding = 10; // pixels from edge

    // Create a separate minimap scene
    this.minimapScene = new Scene();

    // Add the whole world to minimap scene
    this.minimapScene.add(worldScene);

    // Red dot for player
    const playerDotGeometry = new SphereGeometry(1, 8, 8);
    const playerDotMaterial = new MeshBasicMaterial({ color: 0xff0000 });
    this.playerDot = new Mesh(playerDotGeometry, playerDotMaterial);
    this.minimapScene.add(this.playerDot);

    // Green dot for door
    const doorDotGeometry = new SphereGeometry(1, 8, 8);
    const doorDotMaterial = new MeshBasicMaterial({ color: 0x00ff00 });
    this.doorDot = new Mesh(doorDotGeometry, doorDotMaterial);
    this.minimapScene.add(this.doorDot);

    // Set door position (adjust to match game world)
    this.doorDot.position.set(-28.28, 0.5, -74.33);
  }

  update() {
    if (!this.player.model) return;

    const minimapWidth = window.innerWidth * this.sizePercent;
    const minimapHeight = window.innerHeight * this.sizePercent;

    // Set viewport for minimap
    this.renderer.setViewport(
      window.innerWidth - minimapWidth - this.padding,
      this.padding,
      minimapWidth,
      minimapHeight
    );
    this.renderer.setScissor(
      window.innerWidth - minimapWidth - this.padding,
      this.padding,
      minimapWidth,
      minimapHeight
    );
    this.renderer.setScissorTest(true);

    this.miniMapCamera.aspect = 1;

    // Keep minimap camera high above center of world
    this.miniMapCamera.position.set(0, 200, 0);
    this.miniMapCamera.lookAt(new Vector3(0, 0, 0));
    this.miniMapCamera.updateMatrixWorld();
    this.miniMapCamera.updateProjectionMatrix();

    // Update player dot position in minimap scene
    this.playerDot.position.copy(this.player.model.position);
    this.playerDot.position.y += 0.5;

    // Render the minimap scene (with dots)
    this.renderer.render(this.worldScene, this.miniMapCamera);
  }
}
