import { useMemo, useState } from "react";
import type { Route } from "../lib/router";
import { useStore } from "../store/AppStore";
import { ConfirmDialog, EmptyState, PageHeader } from "../components/ui";
import { Icon } from "../components/Icon";
import { cx, dayGroup, relativeTime } from "../lib/utils";
import type { Chat } from "../types";

function preview(c: Chat) {
  const last = [...c.messages].reverse().find((m) => m.role === "assistant" && m.content) ?? c.messages[c.messages.length - 1];
  return (last?.content ?? "")
    .replace(/\$\$?[^$]*\$\$?/g, "…")
    .replace(/[#>*_`|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
}

export function HistoryView({ navigate }: { navigate: (r: Route) => void }) {
  const { chats, renameChat, deleteChat, toast, isBusy } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [toDelete, setToDelete] = useState<Chat | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(s) || c.messages.some((m) => m.content.toLowerCase().includes(s)));
  }, [chats, q]);

  const groups = useMemo(() => {
    const g = new Map<string, Chat[]>();
    for (const c of filtered) {
      const k = dayGroup(c.updatedAt);
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()];
  }, [filtered]);

  const save = (id: string) => {
    if (draft.trim()) {
      renameChat(id, draft);
      toast("Chat renamed", "success");
    }
    setEditing(null);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        eyebrow="History"
        title="Your conversations"
        subtitle={`${chats.length} chat${chats.length === 1 ? "" : "s"}, stored privately in this browser.`}
        right={
          <button className="btn btn-primary" onClick={() => navigate({ name: "chat", id: null })}>
            <Icon name="plus" size={16} /> New chat
          </button>
        }
      />

      {chats.length > 0 && (
        <div className="relative mb-6 animate-rise">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field !rounded-xl !pl-10" placeholder="Search chats…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
        </div>
      )}

      {chats.length === 0 ? (
        <EmptyState
          icon="history"
          title="No conversations yet"
          body="Start a chat with OLIS and it will be saved here automatically, so you can come back to it anytime."
          action={
            <button className="btn btn-primary" onClick={() => navigate({ name: "chat", id: null })}>
              Start learning
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title="No matches" body={`Nothing in your history matches “${q}”.`} />
      ) : (
        <div className="space-y-8">
          {groups.map(([label, list]) => (
            <section key={label} className="animate-rise">
              <h2 className="eyebrow mb-2 px-1">{label}</h2>
              <div className="card divide-y divide-line overflow-hidden">
                {list.map((c) => (
                  <div key={c.id} className="group flex items-center gap-2 px-2 transition hover:bg-surface-2/60">
                    {editing === c.id ? (
                      <input
                        autoFocus
                        className="field my-2.5 ml-2 !py-1.5 text-sm"
                        value={draft}
                        maxLength={80}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => save(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") save(c.id);
                          if (e.key === "Escape") setEditing(null);
                        }}
                        aria-label="Chat title"
                      />
                    ) : (
                      <button className="min-w-0 flex-1 px-2 py-3.5 text-left" onClick={() => navigate({ name: "chat", id: c.id })}>
                        <div className="flex items-center gap-2">
                          {isBusy(c.id) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                          <span className="truncate text-sm font-medium">{c.title}</span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-faint">
                          {c.messages.length === 0 ? "Empty chat" : preview(c) || "…"}
                        </div>
                      </button>
                    )}
                    <span className="hidden shrink-0 text-xs text-faint sm:block">
                      {c.messages.filter((m) => m.role === "user").length} msg · {relativeTime(c.updatedAt)}
                    </span>
                    <div className={cx("flex shrink-0 items-center", editing === c.id && "invisible")}>
                      <button
                        className="icon-btn h-8 w-8"
                        onClick={() => {
                          setDraft(c.title);
                          setEditing(c.id);
                        }}
                        aria-label={`Rename ${c.title}`}
                        title="Rename"
                      >
                        <Icon name="pencil" size={15} />
                      </button>
                      <button className="icon-btn h-8 w-8 hover:!text-danger" onClick={() => setToDelete(c)} aria-label={`Delete ${c.title}`} title="Delete">
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this chat?"
        body={`“${toDelete?.title ?? ""}” will be permanently removed from this browser.`}
        onConfirm={() => {
          if (toDelete) {
            deleteChat(toDelete.id);
            toast("Chat deleted", "success");
          }
        }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
