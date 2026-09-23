// Runs the Vercel functions in /api inside the Vite dev server,
// so `npm run dev` gives you the full stack locally.
// Server-only env vars (GEMINI_API_KEY, …) are read from .env.local and never
// exposed to the browser (only VITE_* vars are).
import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const ROUTES = ["agent", "generate", "health", "feedback"];

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const ctrl = new AbortController();
  req.on("close", () => {
    if (!req.complete) ctrl.abort();
  });
  const method = req.method ?? "GET";
  return new Request(`http://${req.headers.host}${req.url}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
    signal: ctrl.signal,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  res.on("close", () => void reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

export function olisApi(): Plugin {
  return {
    name: "olis-api",
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [k, v] of Object.entries(env)) if (!k.startsWith("VITE_") && process.env[k] === undefined) process.env[k] = v;

      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z]+)(\?.*)?$/);
        if (!m || !ROUTES.includes(m[1])) return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${m[1]}.ts`)) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? "GET"];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          await send(res, await handler(await toRequest(req)));
        } catch (e) {
          console.error("[olis-api]", e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: { code: "server", message: "Local API error" } }));
          } else res.end();
        }
      });
    },
  };
}
