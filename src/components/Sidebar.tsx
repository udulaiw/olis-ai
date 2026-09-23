import type { Route } from "../lib/router";
import { useStore } from "../store/AppStore";
import { Icon } from "./Icon";
import { OlisLockup } from "./Brand";
import { AIcon, HoverAnimate, type AnimatedIconName } from "./AnimatedIcon";
import { Orb } from "./Orb";
import { cx } from "../lib/utils";

interface Props {
  route: Route;
  navigate: (r: Route) => void;
  open: boolean;
  onClose: () => void;
}

const NAV: { label: string; icon: AnimatedIconName; to: Route; match: (r: Route) => boolean }[] = [
  { label: "Home", icon: "dashboard", to: { name: "home" }, match: (r) => r.name === "home" },
  { label: "New Chat", icon: "chat", to: { name: "chat", id: null }, match: (r) => r.name === "chat" && r.id === null },
  { label: "History", icon: "history", to: { name: "history" }, match: (r) => r.name === "history" },
  { label: "Study Tools", icon: "layers", to: { name: "tools", tool: "flashcards" }, match: (r) => r.name === "tools" },
  { label: "OLIS × ORBIX", icon: "orbit", to: { name: "orbix" }, match: (r) => r.name === "orbix" },
  { label: "Settings", icon: "settings", to: { name: "settings" }, match: (r) => r.name === "settings" },
];

export function Sidebar({ route, navigate, open, onClose }: Props) {
  const { chats, engine, engineLabel, isBusy, cloud } = useStore();
  const recent = chats.filter((c) => c.messages.length > 0).slice(0, 6);
  const go = (r: Route) => {
    navigate(r);
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cx("fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity md:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-line bg-bg transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
          "md:sticky md:top-0 md:h-dvh md:translate-x-0",
          open ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
        aria-label="Sidebar"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <button onClick={() => go({ name: "home" })} className="min-w-0 text-left" aria-label="OLIS home">
            <OlisLockup size="sm" />
          </button>
          <button className="icon-btn ml-auto md:hidden" onClick={onClose} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>

        {/* Nav */}
        <nav className="px-3" aria-label="Main">
          {NAV.map((n) => {
            const active = n.match(route);
            return (
              <HoverAnimate key={n.label}>
                <button
                  onClick={() => go(n.to)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active ? "bg-surface-2 font-medium text-ink" : "text-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  <AIcon name={n.icon} size={18} className={active ? "text-accent" : ""} />
                  {n.label}
                </button>
              </HoverAnimate>
            );
          })}
        </nav>

        {/* Recent chats */}
        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
          <div className="eyebrow mb-2 px-3">Recent</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-3 text-xs leading-relaxed text-faint">Your conversations will appear here.</p>
            ) : (
              recent.map((c) => {
                const active = route.name === "chat" && route.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => go({ name: "chat", id: c.id })}
                    className={cx(
                      "flex w-full items-center gap-2 truncate rounded-lg px-3 py-2 text-left text-[13px] transition-colors",
                      active ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface hover:text-ink",
                    )}
                    title={c.title}
                  >
                    {isBusy(c.id) && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-label="Generating" />}
                    <span className="truncate">{c.title}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-line px-5 py-4">
          <button
            onClick={() => go({ name: "settings" })}
            className="mb-3 flex w-full items-center gap-2 text-left text-xs text-muted hover:text-ink"
            title="Change intelligence engine"
          >
            {cloud.status === "checking" ? (
              <Orb state="connecting" size={20} label="Connecting to OLIS Cloud" />
            ) : (
              <span className="grid w-5 place-items-center">
                <span className={cx("h-1.5 w-1.5 rounded-full", engine.kind === "cloud" ? "bg-success" : "bg-lavender")} />
              </span>
            )}
            <span className="truncate">{engineLabel}</span>
          </button>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[13px] font-semibold">OLIS Beta</div>
              <div className="text-[11px] text-faint">In active development</div>
            </div>
            <code className="font-mono text-[11px] text-faint">v0.3 beta</code>
          </div>
        </div>
      </aside>
    </>
  );
}
