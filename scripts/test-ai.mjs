#!/usr/bin/env node
// Runs scripts/ai-selftest.ts through Vite's SSR loader (same TypeScript
// handling as `npm run dev`), so no extra test dependencies are needed.
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let ok = false;
try {
  const mod = await server.ssrLoadModule("/scripts/ai-selftest.ts");
  ok = Boolean(mod.ok);
} catch (e) {
  console.error(e);
} finally {
  await server.close();
}
process.exit(ok ? 0 : 1);
