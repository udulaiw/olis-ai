// "Connect your ORBIX ecosystem": demo switches. They only light up the map;
// nothing is read or shared, and the copy says so.
import { Icon } from "../Icon";
import { cx } from "../../lib/utils";
import { APPS, type AppId } from "./data";
import { DemoBadge, Switch } from "./bits";

export function ConnectPanel({ connected, toggle, setAll }: { connected: Set<AppId>; toggle: (id: AppId, on: boolean) => void; setAll: (on: boolean) => void }) {
  const apps = APPS.filter((a) => a.connectable);
  const allOn = apps.every((a) => connected.has(a.id));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[15px] font-semibold">Connect your ORBIX ecosystem</h3>
          <DemoBadge />
        </div>
        <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setAll(!allOn)}>
          {allOn ? "Disconnect all" : "Connect all"}
        </button>
      </div>

      <ul className="divide-y divide-line">
        {apps.map((a) => {
          const on = connected.has(a.id);
          return (
            <li key={a.id} className="flex items-start gap-3.5 px-5 py-4">
              <span className={cx("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
                <Icon name={a.icon} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.name}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{a.role}</p>
                <p className="mt-1 text-[12px] text-faint">
                  OLIS could read: <span className="text-muted">{a.access}</span>
                </p>
              </div>
              <Switch checked={on} onChange={(v) => toggle(a.id, v)} label={`Connect ${a.name} (demo)`} />
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-3 border-t border-line bg-surface-2/50 px-5 py-4">
        <Icon name="key" size={16} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          <span className="font-medium text-ink">You decide what OLIS can access.</span> Each app is off until you switch it on, and you can switch it off any
          time. In this preview the switches only light up the map: nothing is read or shared yet.
        </p>
      </div>
    </div>
  );
}
