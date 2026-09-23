// OLIS at the centre of the ORBIX ecosystem. Lines are faint by default; a
// connected app gets an accent line with a slow pulse travelling into OLIS.
import { useState } from "react";
import { OlisMark } from "../Brand";
import { Icon } from "../Icon";
import { cx } from "../../lib/utils";
import { APPS, type AppId } from "./data";

const CENTER = { x: 50, y: 50 };

export function EcosystemMap({ connected }: { connected: Set<AppId> }) {
  const [focus, setFocus] = useState<AppId | null>(null);
  const focused = APPS.find((a) => a.id === focus);
  const anyOn = connected.size > 0;

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[640px] sm:aspect-[16/11]">
        {/* Connection lines, drawn in % space */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {APPS.map((a) => {
            const on = connected.has(a.id);
            const soon = !a.connectable;
            return (
              <g key={a.id}>
                <line
                  x1={a.pos.x}
                  y1={a.pos.y}
                  x2={CENTER.x}
                  y2={CENTER.y}
                  vectorEffect="non-scaling-stroke"
                  className={cx("transition-[stroke,stroke-opacity] duration-500", on ? "orbix-line-on" : "orbix-line")}
                  strokeDasharray={soon ? "3 5" : undefined}
                  strokeOpacity={focus === a.id ? 1 : undefined}
                />
              </g>
            );
          })}
        </svg>

        {/* A glowing dot flows from each connected app into OLIS */}
        {APPS.filter((a) => connected.has(a.id)).map((a, i) => (
          <span
            key={a.id}
            className="orbix-dot"
            style={{ "--x0": `${a.pos.x}%`, "--y0": `${a.pos.y}%`, animationDelay: `${i * 0.7}s` } as React.CSSProperties}
            aria-hidden="true"
          />
        ))}

        {/* OLIS in the middle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={cx("orbix-core grid origin-center scale-[0.8] place-items-center rounded-[30%] sm:scale-100", anyOn && "is-on")}>
            <OlisMark size={76} alive="full" />
          </div>
          <div className="relative mt-1 text-center text-[11px] font-medium tracking-[0.16em] text-muted sm:mt-2"><span className="rounded bg-bg px-1">OLIS</span></div>
        </div>

        {/* Apps */}
        {APPS.map((a) => {
          const on = connected.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onMouseEnter={() => setFocus(a.id)}
              onMouseLeave={() => setFocus((f) => (f === a.id ? null : f))}
              onFocus={() => setFocus(a.id)}
              onBlur={() => setFocus((f) => (f === a.id ? null : f))}
              onClick={() => setFocus((f) => (f === a.id ? null : a.id))}
              aria-describedby="orbix-map-caption"
              className="group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: `${a.pos.x}%`, top: `${a.pos.y}%` }}
            >
              <span
                className={cx(
                  "relative grid h-11 w-11 place-items-center rounded-2xl border bg-surface transition-all duration-300 sm:h-12 sm:w-12",
                  on ? "border-accent/50 text-accent shadow-[0_0_0_4px_var(--c-accent-soft)]" : "border-line text-muted group-hover:border-line-strong group-hover:text-ink",
                  !a.connectable && "border-dashed",
                )}
              >
                <Icon name={a.icon} size={19} />
                <span
                  className={cx(
                    "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg transition-colors",
                    on ? "bg-success" : a.connectable ? "bg-surface-3" : "bg-transparent border-transparent",
                  )}
                  aria-hidden="true"
                />
              </span>
              <span className={cx("rounded-md bg-bg px-1.5 text-[12px] font-medium transition-colors sm:text-[13px]", on || focus === a.id ? "text-ink" : "text-muted")}>{a.name}</span>
            </button>
          );
        })}
      </div>

      <p id="orbix-map-caption" className="mx-auto mt-4 min-h-[2.75rem] max-w-md text-center text-[13px] leading-relaxed text-muted" aria-live="polite">
        {focused ? (
          <>
            <span className="font-medium text-ink">{focused.name}. </span>
            {focused.role}
            {!focused.connectable && <span className="text-faint"> Coming to OLIS.</span>}
            {focused.connectable && <span className="text-faint">{connected.has(focused.id) ? " Connected in this demo." : " Not connected."}</span>}
          </>
        ) : (
          <span className="text-faint">Hover or tap an app to see what OLIS does there.</span>
        )}
      </p>
    </div>
  );
}
