import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
	plugins: [topLevelAwait()],
	publicDir: "./public",
	base: "./",
	build: {
		rollupOptions: {
			input: {
				main: "./index.html",
				stage1: "./src/pages/stage1/stage1.html",
				stage2: "./src/pages/stage2/stage2.html",
				stage3: "./src/pages/stage3/stage3.html",
				credits: "./src/pages/credits/credits.html",
			},
		},
	},
	assetsInclude: [
		"**/*.wasm",
		"**/*.glb",
		"**/*.fbx",
		"**/*.gltf",
		"**/*.mp3",
		"**/*.mp4",
		"**/*.m4a",
		"**/*.wav",
	],
	server: {
		fs: {
			strict: false,
		},
		mimeTypes: {
			"application/javascript": ["js", "mjs"],
		},
	},
});
