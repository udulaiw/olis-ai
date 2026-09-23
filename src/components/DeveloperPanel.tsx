// Settings → Developer: internal AI provider health. Hidden behind the
// server's OLIS_ADMIN_TOKEN, so students never see provider/model details.
import { useState } from "react";
import { providerHealth, type ProviderHealth } from "../services/cloud";
import { Icon } from "./Icon";
import { Spinner } from "./ui";
import { cx } from "../lib/utils";

const STATUS_CLS: Record<string, string> = {
  healthy: "bg-success-soft text-success",
  degraded: "bg-lavender-soft text-lavender",
  rate_limited: "bg-danger-soft text-danger",
  down: "bg-danger-soft text-danger",
  blocked: "border border-line text-faint",
  unconfigured: "border border-line text-faint",
};
const LABEL: Record<string, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  rate_limited: "Rate limited",
  down: "Down",
  blocked: "Blocked (Free Beta)",
  unconfigured: "Not configured",
};

function Status({ s }: { s: string }) {
  return <span className={cx("whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium", STATUS_CLS[s] ?? "text-faint")}>{LABEL[s] ?? s}</span>;
}

export function DeveloperPanel() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<ProviderHealth | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (probe = false) => {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    const r = await providerHealth(token.trim(), { probe });
    setLoading(false);
    if ("error" in r) {
      setData(null);
      setError(r.error);
    } else setData(r);
  };

  return (
    <details className="group rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-[13px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-muted marker:hidden">
        <Icon name="activity" size={14} /> Developer: AI engine health
        <Icon name="chevronDown" size={14} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[12px] text-faint">For the OLIS admin only. The token isn't saved.</p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input type="password" autoComplete="off" className="field !w-auto min-w-[10rem] flex-1 !py-1.5 text-sm" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Admin token" />
          <button className="btn btn-secondary !py-1.5" disabled={!token.trim() || loading}>
            {loading ? <Spinner /> : <Icon name="refresh" size={14} />} Check
          </button>
          <button type="button" className="btn btn-secondary !py-1.5 whitespace-nowrap" disabled={!token.trim() || loading} onClick={() => void load(true)} title="Sends one tiny request to every engine">
            <Icon name="activity" size={14} /> Test all
          </button>
        </form>
        {error && <p className="text-danger">{error}</p>}
        {data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint">
              <span>
                Free Beta: <span className={data.freeBeta ? "text-success" : "text-danger"}>{data.freeBeta ? "ON (paid models blocked)" : "OFF"}</span>
              </span>
              <span>Limits store: {data.limitsStore}</span>
            </div>
            {data.probe && (
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="bg-surface px-3 py-2 font-medium">Connection test</div>
                <ul className="divide-y divide-line">
                  {data.probe.map((r) => (
                    <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{r.model}</code>
                      <span className="text-[11px] text-faint">
                        {(r.ms / 1000).toFixed(1)}s{r.ok ? "" : ` · ${r.error}${r.status ? ` ${r.status}` : ""}`}
                      </span>
                      <Status s={r.ok ? "healthy" : "down"} />
                      {!r.ok && r.detail && <span className="w-full text-[11px] text-faint">{r.detail}</span>}
                    </li>
                  ))}
                  {data.probe.length === 0 && <li className="px-3 py-2 text-faint">No engines configured.</li>}
                </ul>
              </div>
            )}
            {data.providers.map((p) => (
              <div key={p.id} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-center justify-between gap-2 bg-surface px-3 py-2">
                  <span className="font-medium">{p.label}</span>
                  <Status s={p.status} />
                </div>
                <ul className="divide-y divide-line">
                  {p.models.map((m) => (
                    <li key={m.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{m.model}</code>
                      <span className="text-[11px] text-faint">
                        {m.successes}✓ {m.failures}✗{m.avgMs ? ` · ${(m.avgMs / 1000).toFixed(1)}s` : ""}
                        {m.lastError ? ` · last: ${m.lastError}` : ""}
                        {m.cooldownSeconds ? ` · back in ${m.cooldownSeconds}s` : ""}
                      </span>
                      <Status s={m.status} />
                      {m.note && <span className="w-full text-[11px] text-faint">{m.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data.knowledge && (
              <p className="text-[12px] text-faint">
                Knowledge: {data.knowledge.files} files · {data.knowledge.chunks} passages · {data.knowledge.semantic ? "semantic + keyword" : "keyword only"} search
                {data.knowledge.pastPaperChunks ? ` · ${data.knowledge.pastPaperChunks} past-paper passages` : ""}
              </p>
            )}
            <p className="text-[11px] text-faint">Health is tracked per server instance and resets when a new one starts.</p>
          </div>
        )}
      </div>
    </details>
  );
}
