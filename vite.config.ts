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
    // KaTeX (math rendering) is most of the bundle; ~230 kB gzipped total is fine for this app.
    chunkSizeWarningLimit: 800,
  },
});
