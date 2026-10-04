#!/usr/bin/env node
// Runs a TypeScript script through Vite's SSR loader (same TS handling as `npm run dev`),
// so tests need no extra tooling.   node scripts/run-ts.mjs scripts/lang-selftest.ts
import { createServer } from "vite";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/run-ts.mjs <script.ts>");
  process.exit(2);
}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
let ok = false;
try {
  const mod = await server.ssrLoadModule("/" + file.replace(/^\.?\//, ""));
  ok = mod.ok !== false;
} catch (e) {
  console.error(e);
} finally {
  await server.close();
}
process.exit(ok ? 0 : 1);
