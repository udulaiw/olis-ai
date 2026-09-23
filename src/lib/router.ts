import { useCallback, useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "chat"; id: string | null }
  | { name: "history" }
  | { name: "tools"; tool: ToolId }
  | { name: "settings" }
  | { name: "orbix" };

export type ToolId = "flashcards" | "quiz" | "planner" | "explainer";
const TOOLS: ToolId[] = ["flashcards", "quiz", "planner", "explainer"];

export function parse(hash: string): Route {
  const [a, b] = hash.replace(/^#\/?/, "").split("/");
  switch (a) {
    case "chat":
      return { name: "chat", id: b && b !== "new" ? decodeURIComponent(b) : null };
    case "history":
      return { name: "history" };
    case "tools":
      return { name: "tools", tool: TOOLS.includes(b as ToolId) ? (b as ToolId) : "flashcards" };
    case "settings":
      return { name: "settings" };
    case "orbix":
      return { name: "orbix" };
    default:
      return { name: "home" };
  }
}

export function toHash(r: Route): string {
  switch (r.name) {
    case "home":
      return "#/";
    case "chat":
      return `#/chat/${r.id ? encodeURIComponent(r.id) : "new"}`;
    case "tools":
      return `#/tools/${r.tool}`;
    default:
      return `#/${r.name}`;
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const navigate = useCallback((r: Route, opts: { replace?: boolean } = {}) => {
    const h = toHash(r);
    if (opts.replace) {
      history.replaceState(null, "", h);
      setRoute(parse(h));
    } else if (location.hash !== h) location.hash = h;
    else setRoute(parse(h));
  }, []);
  return { route, navigate };
}
