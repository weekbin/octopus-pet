import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 2 + Vite: dev server runs on a fixed port, no host check (Tauri spawns it).
// Tauri 2 expects HMR over websocket. See https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 1421,
    },
    watch: {
      // Don't watch src-tauri (Rust changes trigger cargo rebuild via tauri dev)
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist",
  },
  // Tauri loads from dist/ at build, dev from the dev server URL.
  // See tauri.conf.json -> build.devUrl / build.frontendDist.
});
