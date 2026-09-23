import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { olisApi } from "./scripts/vite-api";

export default defineConfig({
  plugins: [react(), tailwindcss(), olisApi()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    sourcemap: false, // never ship source maps (keeps server paths and code structure private)
    // KaTeX (math rendering) is most of the bundle; ~230 kB gzipped total is fine for this app.
    chunkSizeWarningLimit: 800,
  },
});
