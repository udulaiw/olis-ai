// OLIS × ORBIX: a preview of OLIS as the intelligence layer of orbix.lk.
// Demo only. Integrations are labelled honestly; the Workspace actions are real.
import { useState } from "react";
import type { Route } from "../lib/router";
import { useStore } from "../store/AppStore";
import { OlisMark } from "../components/Brand";
import { AIcon, HoverAnimate } from "../components/AnimatedIcon";
import { cx } from "../lib/utils";
import { EcosystemMap } from "../components/orbix/EcosystemMap";
import { ConnectPanel } from "../components/orbix/ConnectPanel";
import { WorkspacePreview } from "../components/orbix/WorkspacePreview";
import { DemoBadge, StatusTag } from "../components/orbix/bits";
import { LAYERS, MODES, ORBIX_URL, type AppId, type WorkspaceAction } from "../components/orbix/data";

function Section({ eyebrow, title, body, children, className }: { eyebrow: string; title: string; body?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("mt-20 animate-rise", className)}>
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">{title}</h2>
      {body && <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">{body}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

export function OrbixView({ navigate }: { navigate: (r: Route) => void }) {
  const { send } = useStore();
  const [connected, setConnected] = useState<Set<AppId>>(() => new Set(["notes"]));

  const toggle = (id: AppId, on: boolean) =>
    setConnected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setAll = (on: boolean) => setConnected(on ? new Set<AppId>(["workspace", "notes", "papers", "progress"]) : new Set());

  const run = (a: WorkspaceAction, card: { title: string; text: string }) => {
    if (!a.prompt || !a.mode) return;
    const id = send(null, { text: a.prompt, mode: a.mode, attachment: { name: `${card.title} (ORBIX demo card)`, text: card.text } });
    navigate({ name: "chat", id });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      {/* Hero */}
      <header className="animate-rise text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <span className="eyebrow">OLIS × ORBIX</span>
          <DemoBadge />
        </div>
        <h1 className="mx-auto max-w-2xl text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[48px]">OLIS lives across ORBIX.</h1>
        <p className="mx-auto mt-4 max-w-lg text-[15.5px] leading-relaxed text-muted">
          Your AI shouldn't be somewhere you visit. It should be part of the way you study.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <HoverAnimate>
            <a href={ORBIX_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Visit orbix.lk <AIcon name="external" size={15} />
            </a>
          </HoverAnimate>
          <HoverAnimate>
            <button className="btn btn-secondary" onClick={() => navigate({ name: "chat", id: null })}>
              Try OLIS now <AIcon name="arrowRight" size={15} />
            </button>
          </HoverAnimate>
        </div>
        <p className="mt-4 text-[12px] text-faint">A preview of what's coming. OLIS doesn't connect to ORBIX accounts yet.</p>
      </header>

      {/* Map */}
      <div className="mt-12 animate-rise [animation-delay:80ms]">
        <EcosystemMap connected={connected} />
      </div>

      {/* Connect */}
      <Section
        eyebrow="Permissions"
        title="Connected by choice"
        body="OLIS only sees the parts of ORBIX you switch on. Try it: switching an app on connects it on the map above."
      >
        <ConnectPanel connected={connected} toggle={toggle} setAll={setAll} />
      </Section>

      {/* Workspace */}
      <Section
        eyebrow="OLIS inside Workspace"
        title="Not another chat tab"
        body="Select something on your board and ask OLIS about it, right where you're studying. The available actions below work today."
      >
        <WorkspacePreview onRun={run} />
      </Section>

      {/* Modes */}
      <Section eyebrow="Roles" title="One intelligence, five roles" body="OLIS changes how it helps depending on what you need.">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <div key={m.name} className={cx("card !rounded-2xl p-4", m.status === "soon" && "!bg-transparent !shadow-none")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{m.name}</span>
                <StatusTag status={m.status} />
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{m.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Architecture */}
      <Section
        eyebrow="Under the hood"
        title="How OLIS is being built"
        body="Four layers. OLIS looks things up at answer time instead of being retrained, so it gets smarter as the knowledge grows."
      >
        <ol className="relative">
          {LAYERS.map((l, i) => (
            <li key={l.name} className="relative flex gap-4 pb-5 last:pb-0">
              {/* rail */}
              {i < LAYERS.length - 1 && <span className="absolute left-[15px] top-9 bottom-0 w-px bg-line" aria-hidden="true" />}
              <span className="relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-surface font-mono text-xs text-muted">
                {i + 1}
              </span>
              <div className="card min-w-0 flex-1 !rounded-2xl p-4">
                <div className="text-sm font-semibold">{l.name}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{l.body}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  {l.items.map((it) => (
                    <span key={it.label} className="inline-flex items-center gap-2 text-[12.5px]">
                      <span className="text-ink/90">{it.label}</span>
                      <StatusTag status={it.status} compact />
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Close */}
      <section className="mt-20 animate-rise rounded-[26px] border border-line bg-surface/60 px-6 py-10 text-center">
        <div className="flex justify-center"><OlisMark size={44} alive="calm" /></div>
        <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.02em]">ORBIX is the ecosystem. OLIS is the intelligence.</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">OLIS is in beta today, and the ORBIX connections are next.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <a href={ORBIX_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Explore orbix.lk
          </a>
          <button className="btn btn-primary" onClick={() => navigate({ name: "chat", id: null })}>
            Ask OLIS something
          </button>
        </div>
      </section>
    </div>
  );
}
