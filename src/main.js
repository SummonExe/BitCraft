import { Scene, PerspectiveCamera, WebGLRenderer, Mesh, PlaneGeometry, DoubleSide, TextureLoader, MeshStandardMaterial, AmbientLight } from 'three';

const scene = new Scene();
const camera = new PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const textureLoader = new TextureLoader();
const groundTexture = textureLoader.load('/src/assets/textures/Cobblestone.png', undefined, undefined, (error) => {
  console.error('Texture loading failed:', error);
});
const groundMaterial = new MeshStandardMaterial( { map: groundTexture, side: DoubleSide } );
const groundGeometry = new PlaneGeometry( 250, 250 );
const ground = new Mesh( groundGeometry, groundMaterial );
ground.rotation.x = Math.PI / 2;
scene.add( ground );

const light = new AmbientLight( 0xffffff, 1 ); // Add ambient light
scene.add( light );

camera.position.set( 0, 10, 50 );

function animate() {
  renderer.render( scene, camera );
}