import { useRef, useState, type ReactNode } from "react";
import { useStore, DEFAULT_SETTINGS } from "../store/AppStore";
import { BetaNotice, ConfirmDialog, ContextBar, PageHeader } from "../components/ui";
import { CREATOR, OlisLockup } from "../components/Brand";
import { AIcon, HoverAnimate } from "../components/AnimatedIcon";
import { Icon, type IconName } from "../components/Icon";
import { cx } from "../lib/utils";
import { StudyProfileEditor } from "../components/StudyProfile";
import { lazy, Suspense } from "react";
// Admin-only: not downloaded unless unlocked
const DeveloperPanel = lazy(() => import("../components/DeveloperPanel").then((m) => ({ default: m.DeveloperPanel })));
import type { Chat, Theme } from "../types";

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6 animate-rise">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const THEMES: { id: Theme; label: string; icon: IconName }[] = [
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "light", label: "Light", icon: "sun" },
  { id: "system", label: "System", icon: "monitor" },
];

export function SettingsView() {
  const { settings, updateSettings, cloud, chats, deleteAllChats, importChats, toast } = useStore();
  const [confirm, setConfirm] = useState<null | "chats" | "reset">(null);
  const [versionTaps, setVersionTaps] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const exportChats = () => {
    const blob = new Blob([JSON.stringify({ app: "OLIS Beta", version: "0.2", exportedAt: new Date().toISOString(), chats }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olis-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${chats.length} chat${chats.length === 1 ? "" : "s"}`, "success");
  };

  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list: Chat[] = Array.isArray(data) ? data : data.chats;
      if (!Array.isArray(list) || !list.every((c) => c && typeof c.id === "string" && Array.isArray(c.messages))) throw new Error();
      importChats(list);
      toast(`Imported ${list.length} chat${list.length === 1 ? "" : "s"}`, "success");
    } catch {
      toast("That file isn't a valid OLIS history export.", "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader eyebrow="Settings" title="Settings" subtitle="Your chats, settings and study profile stay in this browser. No account needed." />

      <div className="space-y-4">
        <Section title="Appearance" desc="Dark mode is designed for long, calm study sessions.">
          <div className="segmented" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} aria-pressed={settings.theme === t.id} onClick={() => updateSettings({ theme: t.id })}>
                <Icon name={t.icon} size={15} /> {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Default learning context" desc="OLIS uses this to adapt every answer. You can also change it from the chat.">
          <ContextBar compact />
        </Section>

        <Section title="Study profile" desc="Tell OLIS how you learn. It uses this to pitch explanations and focus on the topics you find hard.">
          <StudyProfileEditor />
        </Section>

        <Section title="Intelligence engine" desc="What powers OLIS. OLIS Beta is free to use, and API keys stay on the server, never in your browser.">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "cloud",
                  title: "OLIS Cloud",
                  badge: "Research agent · recommended",
                  body: "Several AI engines with automatic switching, plus OLIS study notes, Wikipedia and trusted web research, with cited sources.",
                },
                { id: "demo", title: "Offline engine", badge: "No internet needed", body: "Built-in lessons, step-by-step solver, quiz bank and planner. Also the automatic fallback." },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                onClick={() => updateSettings({ engine: o.id })}
                aria-pressed={settings.engine === o.id}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  settings.engine === o.id ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{o.title}</span>
                  <span className={cx("grid h-4 w-4 place-items-center rounded-full border", settings.engine === o.id ? "border-accent bg-accent" : "border-line-strong")}>
                    {settings.engine === o.id && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-faint">{o.badge}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{o.body}</p>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                <span
                  className={cx(
                    "h-2 w-2 rounded-full",
                    cloud.status === "ready" ? "bg-success" : cloud.status === "checking" ? "animate-pulse bg-lavender" : "bg-danger",
                  )}
                />
                OLIS Cloud: {cloud.status === "ready" ? "connected" : cloud.status === "checking" ? "checking…" : "not reachable"}
              </span>
              <button className="btn btn-ghost !px-2.5 !py-1 !text-xs" onClick={cloud.recheck} disabled={cloud.status === "checking"}>
                <Icon name="refresh" size={13} /> Recheck
              </button>
            </div>
            <p className="mt-2 leading-relaxed text-muted">
              {cloud.status === "ready"
                ? cloud.health?.busy
                  ? "Busy right now (free beta limits). Try again in a minute."
                  : "Answers use OLIS study notes, Wikipedia and trusted sites, with sources. If one AI engine is busy, OLIS switches automatically."
                : cloud.status === "unavailable"
                  ? "OLIS Cloud isn't available right now, so OLIS is using its offline engine."
                  : "Checking…"}
            </p>
          </div>
          {devMode && (
            <div className="mt-3">
              <Suspense fallback={null}>
                <DeveloperPanel />
              </Suspense>
            </div>
          )}
        </Section>

        <Section title="Your data" desc={`${chats.length} chat${chats.length === 1 ? "" : "s"} saved in this browser.`}>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={exportChats} disabled={chats.length === 0}>
              <Icon name="download" size={15} /> Export history
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ""; }} />
            <button className="btn btn-secondary" onClick={() => importRef.current?.click()}>
              <Icon name="upload" size={15} /> Import
            </button>
            <button className="btn btn-danger" onClick={() => setConfirm("chats")} disabled={chats.length === 0}>
              <Icon name="trash" size={15} /> Delete all chats
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirm("reset")}>
              Reset settings
            </button>
          </div>
        </Section>

        <Section title="About">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <OlisLockup size="md" />
            <button
              type="button"
              className="font-mono text-xs text-faint"
              onClick={() => {
                // Tap 5× to show the admin-only developer panel (hidden from students)
                const n = versionTaps + 1;
                setVersionTaps(n);
                if (n >= 5 && !devMode) {
                  setDevMode(true);
                  toast("Developer panel unlocked", "success");
                }
              }}
            >
              v0.3 · beta
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="text-[13px]">
              <div className="text-faint">Created by</div>
              <div className="font-medium">
                {CREATOR.name} · <span className="tracking-[0.08em]">{CREATOR.handle}</span>
              </div>
            </div>
            <HoverAnimate>
              <a href={CREATOR.github} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <Icon name="github" size={15} /> github.com/udulaiw
                <AIcon name="external" size={13} className="text-faint" />
              </a>
            </HoverAnimate>
          </div>
          <BetaNotice className="mt-4" />
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Thinking animations: thinking-orbs by Jakub Antalik (MIT). Animated icons: Animate UI (MIT + Commons Clause). Knowledge: OLIS notes + Wikipedia (CC BY-SA).
          </p>
        </Section>
      </div>

      <ConfirmDialog
        open={confirm === "chats"}
        title="Delete all chats?"
        body="Every conversation in this browser will be permanently removed. Consider exporting first."
        confirmLabel="Delete all"
        onConfirm={() => {
          deleteAllChats();
          toast("All chats deleted", "success");
        }}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        title="Reset settings?"
        body="Theme, learning context, study profile and engine choice go back to defaults. Your chats are kept."
        confirmLabel="Reset"
        onConfirm={() => {
          updateSettings({ ...DEFAULT_SETTINGS });
          toast("Settings reset", "success");
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
