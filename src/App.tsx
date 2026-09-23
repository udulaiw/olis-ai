import { lazy, Suspense, useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { CREATOR } from "./components/Brand";
import { AppStoreProvider } from "./store/AppStore";
import { useHashRoute } from "./lib/router";
import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/ui";
import { Icon, OlisMark } from "./components/Icon";
import { HomeView } from "./pages/HomeView";
import { Orb } from "./components/Orb";

// Secondary pages load on demand so the first paint (home/chat) stays light.
// Chat pulls in the Markdown + KaTeX renderer (most of the JS), so it loads on demand too.
const ChatView = lazy(() => import("./pages/ChatView").then((m) => ({ default: m.ChatView })));
const HistoryView = lazy(() => import("./pages/HistoryView").then((m) => ({ default: m.HistoryView })));
const ToolsView = lazy(() => import("./pages/ToolsView").then((m) => ({ default: m.ToolsView })));
const OrbixView = lazy(() => import("./pages/OrbixView").then((m) => ({ default: m.OrbixView })));
const SettingsView = lazy(() => import("./pages/SettingsView").then((m) => ({ default: m.SettingsView })));

const PageFallback = () => (
  <div className="grid h-full min-h-60 place-items-center">
    <Orb state="breathing" size={32} label="Loading" />
  </div>
);

function Shell() {
  const { route, navigate } = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const titles: Record<string, string> = { home: "OLIS AI · Beta", chat: "Chat · OLIS", history: "History · OLIS", tools: "Study Tools · OLIS", settings: "Settings · OLIS", orbix: "OLIS × ORBIX" };
    document.title = titles[route.name];
  }, [route.name]);

  // Warm up the chat code while the browser is idle, so opening a chat is instant
  useEffect(() => {
    const warm = () => void import("./pages/ChatView");
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else setTimeout(warm, 1500);
  }, []);

  const isChat = route.name === "chat";

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar route={route} navigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 md:hidden">
          <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={20} />
          </button>
          <button className="flex items-center gap-2" onClick={() => navigate({ name: "home" })} aria-label="OLIS home">
            <OlisMark size={26} />
            <span className="text-[15px] font-semibold">OLIS</span>
            <span className="badge-beta">BETA</span>
          </button>
          <button className="icon-btn ml-auto" onClick={() => navigate({ name: "chat", id: null })} aria-label="New chat">
            <Icon name="compose" size={19} />
          </button>
        </header>

        <main className={isChat ? "flex min-h-0 flex-1 flex-col" : "min-h-0 flex-1 overflow-y-auto"}>
          {route.name === "home" && <HomeView navigate={navigate} />}
          <Suspense fallback={<PageFallback />}>
            {route.name === "chat" && <ChatView id={route.id} navigate={navigate} />}
            {route.name === "history" && <HistoryView navigate={navigate} />}
            {route.name === "tools" && <ToolsView tool={route.tool} navigate={navigate} />}
            {route.name === "settings" && <SettingsView />}
            {route.name === "orbix" && <OrbixView navigate={navigate} />}
          </Suspense>
        </main>

        <footer className="px-4 pb-2 text-right text-[10px] tracking-[0.12em] text-faint/70" aria-label="Credit">
          <a href={CREATOR.github} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-muted" title="UDULAIW on GitHub">
            Made by UDULAIW
          </a>
        </footer>
      </div>

      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppStoreProvider>
        <Shell />
      </AppStoreProvider>
    </MotionConfig>
  );
}
