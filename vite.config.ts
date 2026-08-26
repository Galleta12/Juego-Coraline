import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
    // Phaser son 1.2MB y no se puede partir en algo util: el aviso por
    // defecto solo hace ruido en cada build.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Phaser pesa ~1.2MB; en su propio chunk se cachea aparte del juego.
        manualChunks: { phaser: ["phaser"] },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
