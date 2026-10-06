#!/usr/bin/env node
// Production smoke test: compiles api/ + server/ to plain JavaScript and loads every
// route in plain Node.js (no Vite), the way a Vercel function runs.
//
// Why: the other tests run through Vite, which forgives things Node does not (a bare
// `import x from "./file.json"` works in Vite and crashes a Vercel function with a 500).
//
//   npm run test:prod
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, readdirSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const out = mkdtempSync(join(tmpdir(), "olis-prod-"));
let failed = 0;
try {
  execFileSync(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json", "--noEmit", "false", "--outDir", out, "--rootDir", ".", "--declaration", "false", "--sourceMap", "false"], { stdio: "inherit" });
  // What Vercel ships next to the function: package.json (ESM), node_modules, and vercel.json includeFiles (server/**/*.json)
  cpSync(join(root, "package.json"), join(out, "package.json"));
  symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "dir");
  const copyJson = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) copyJson(p);
      else if (name.endsWith(".json")) cpSync(p, join(out, relative(root, p)));
    }
  };
  copyJson(join(root, "server"));

  const routes = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".js")) routes.push(p);
    }
  };
  walk(join(out, "api"));

  // Run from the output folder, like a function's /var/task, so runtime file reads are tested too
  process.chdir(out);
  const origin = { origin: "http://localhost:5173", host: "localhost:5173", "content-type": "application/json" };
  for (const file of routes.sort()) {
    const name = "/" + relative(out, file).replace(/\.js$/, "");
    try {
      const mod = await import(pathToFileURL(file).href);
      if (!mod.GET && !mod.POST) throw new Error("exports no GET or POST handler");
      // A light call where it is safe without API keys: proves the module works, not just parses
      let status = "";
      if (name === "/api/subjects") status = String((await mod.GET(new Request("http://localhost:5173/api/subjects"))).status);
      if (name === "/api/olis/classify") status = String((await mod.POST(new Request("http://localhost:5173/api/olis/classify", { method: "POST", headers: origin, body: JSON.stringify({ question: "What is momentum?" }) }))).status);
      if (name === "/api/health") status = String((await mod.GET(new Request("http://localhost:5173/api/health"))).status);
      if (status && status !== "200") throw new Error(`responded ${status}`);
      console.log(`✓ ${name} loads${status ? ` (${status})` : ""}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${name}\n    → ${e?.code ?? ""} ${String(e?.message ?? e).split("\n")[0]}`);
    }
  }
  if (!existsSync(join(out, "server", "knowledge", "subjects.json"))) throw new Error("subjects.json not shipped");
} finally {
  process.chdir(root);
  rmSync(out, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} route(s) fail in plain Node.js` : "\nAll routes load in plain Node.js");
process.exit(failed ? 1 : 0);
