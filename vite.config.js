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
  assetsInclude: ['**/*.wasm'], // Include WASM files in the build
  server: {
    fs: {
      strict: false, // Allow serving files outside root for WASM
    },
  },
});