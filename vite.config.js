import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext', // Ensure compatibility with modern JS features
  },
  optimizeDeps: {
    esbuildOptions: {
      // Enable WASM support
      supported: {
        'top-level-await': true,
      },
    },
  },
  assetsInclude: ['**/*.wasm',"**/*.glb","**/*.fbx","**/*.gltf"],
  server: {
    fs: {
      strict: false, 
    },
  },
});