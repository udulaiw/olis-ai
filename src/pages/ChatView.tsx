import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Route } from "../lib/router";
import type { Mode } from "../types";
import { useStore, type SendInput } from "../store/AppStore";
import { Composer, type ComposerHandle } from "../components/Composer";
import { MessageItem } from "../components/MessageItem";
import { ConfirmDialog, ContextBar } from "../components/ui";
import { Icon } from "../components/Icon";
import { Orb } from "../components/Orb";
import { cx } from "../lib/utils";

const SUGGESTIONS: { text: string; mode: Mode; hint: string }[] = [
  { text: "Explain Newton's laws", mode: "explain", hint: "Explain" },
  { text: "Solve 2x² − 5x − 3 = 0", mode: "solve", hint: "Solve" },
  { text: "I have a physics exam in 10 days", mode: "plan", hint: "Study plan" },
  { text: "Quiz me on organic chemistry", mode: "quiz", hint: "Quiz" },
];

export function ChatView({ id, navigate }: { id: string | null; navigate: (r: Route, o?: { replace?: boolean }) => void }) {
  const { getChat, send, stop, isBusy, renameChat, clearChat, deleteChat, toast } = useStore();
  const chat = id ? getChat(id) : undefined;
  const busy = id ? isBusy(id) : false;
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirm, setConfirm] = useState<null | "clear" | "delete">(null);
  const [menu, setMenu] = useState(false);

  // Unknown chat id (e.g. deleted) → go to a new chat
  useEffect(() => {
    if (id && !chat) navigate({ name: "chat", id: null }, { replace: true });
  }, [id, chat, navigate]);

  // Auto-scroll while streaming, unless the student scrolled up to read
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const lastContent = chat?.messages[chat.messages.length - 1];
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastContent?.content, lastContent?.status, lastContent?.quiz, chat?.messages.length]);
  useEffect(() => {
    stick.current = true;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    setEditing(false);
    setMenu(false);
  }, [id]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const onSend = (input: SendInput) => {
    stick.current = true;
    const newId = send(id, input);
    if (newId !== id) navigate({ name: "chat", id: newId }, { replace: true });
  };

  const lastAssistantId = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant")?.id;
  const empty = !chat || chat.messages.length === 0;

  const saveTitle = () => {
    if (chat && draftTitle.trim()) {
      renameChat(chat.id, draftTitle);
      toast("Chat renamed", "success");
    }
    setEditing(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          {editing && chat ? (
            <input
              autoFocus
              className="field !py-1.5 text-sm font-medium"
              value={draftTitle}
              maxLength={80}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="Chat title"
            />
          ) : (
            <button
              className="group flex max-w-full items-center gap-2 rounded-lg px-1 py-1 text-left disabled:cursor-default"
              onClick={() => {
                if (!chat) return;
                setDraftTitle(chat.title);
                setEditing(true);
              }}
              disabled={!chat}
              title={chat ? "Rename chat" : undefined}
            >
              <span className="truncate text-sm font-medium">{chat?.title ?? "New chat"}</span>
              {chat && <Icon name="pencil" size={13} className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />}
            </button>
          )}
        </div>
        <ContextBar compact className="hidden lg:flex" />
        {chat && (
          <div className="relative">
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => !m);
              }}
              aria-label="Chat options"
              aria-expanded={menu}
            >
              <Icon name="dots" />
            </button>
            {menu && (
              <div className="card absolute right-0 top-10 z-30 w-44 !rounded-xl p-1 shadow-pop animate-pop" role="menu">
                <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2" onClick={() => { setDraftTitle(chat.title); setEditing(true); }}>
                  <Icon name="pencil" size={15} /> Rename
                </button>
                <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-40" disabled={chat.messages.length === 0} onClick={() => setConfirm("clear")}>
                  <Icon name="refresh" size={15} /> Clear chat
                </button>
                <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft" onClick={() => setConfirm("delete")}>
                  <Icon name="trash" size={15} /> Delete chat
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cx("mx-auto w-full max-w-3xl px-4 sm:px-6", empty ? "flex min-h-full flex-col justify-center py-10" : "space-y-8 py-8")}>
          {empty ? (
            <div className="text-center animate-rise">
              <div className="mx-auto mb-6 grid h-16 w-16 place-items-center">
                <Orb state="breathing" size={64} label="OLIS is ready" />
              </div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em] sm:text-3xl">What are you learning today?</h1>
              <p className="mt-2 text-sm text-muted">Ask OLIS to explain, solve, plan, practice, or explore.</p>
              <div className="mx-auto mt-8 grid max-w-xl gap-2 text-left sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => onSend({ text: s.text, mode: s.mode })}
                    className="rounded-2xl border border-line bg-surface/50 px-4 py-3 text-sm transition hover:border-line-strong hover:bg-surface"
                  >
                    <span className="block text-[11px] font-medium uppercase tracking-wider text-faint">{s.hint}</span>
                    <span className="text-muted">{s.text}</span>
                  </button>
                ))}
              </div>
              <ContextBar compact className="mt-8 justify-center lg:hidden" />
            </div>
          ) : (
            chat!.messages.map((m) => <MessageItem key={m.id} chatId={chat!.id} msg={m} isLastAssistant={m.id === lastAssistantId} busy={busy} />)
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-3 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {!empty && <ContextBar compact scroll className="mb-2 lg:hidden" />}
          <Composer ref={composer} onSend={onSend} busy={busy} onStop={() => id && stop(id)} autoFocus />
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "clear"}
        title="Clear this chat?"
        body="All messages in this conversation will be removed. The chat itself stays in your history."
        confirmLabel="Clear chat"
        onConfirm={() => {
          if (chat) {
            clearChat(chat.id);
            toast("Chat cleared", "success");
          }
        }}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this chat?"
        body="This permanently removes the conversation from this browser."
        onConfirm={() => {
          if (chat) {
            deleteChat(chat.id);
            toast("Chat deleted", "success");
            navigate({ name: "chat", id: null }, { replace: true });
          }
        }}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
