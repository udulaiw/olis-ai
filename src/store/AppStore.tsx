import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Chat, EngineKind, LearningContext, Message, Mode, QuizProgress, Settings } from "../types";
import { KEYS, load, remove, save } from "../lib/storage";
import { isAbort, titleFrom, uid } from "../lib/utils";
import { OlisError, generateResponse, type EngineConfig } from "../services/olisEngine";
import { cloudHealth, sendFeedback, type CloudHealth } from "../services/cloud";

// ── Defaults ───────────────────────────────────
export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  engine: "cloud", // falls back to "demo" automatically when the cloud isn't reachable
  context: { subject: "General", level: "Intermediate", style: "Detailed explanation" },
  noticeDismissed: false,
};

export type CloudStatus = "checking" | "ready" | "unavailable";

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: string;
  text: string;
  kind: ToastKind;
}

export interface SendInput {
  text: string;
  mode: Mode;
  attachment?: { name: string; text: string };
}

interface Store {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  setContext: (patch: Partial<LearningContext>) => void;
  resolvedTheme: "dark" | "light";
  /** The engine actually used right now (cloud falls back to demo when unreachable) */
  engine: EngineConfig;
  engineLabel: string;
  cloud: { status: CloudStatus; health: CloudHealth | null; recheck: () => void };
  rate: (chatId: string, msgId: string, rating: "up" | "down") => void;

  chats: Chat[];
  getChat: (id: string) => Chat | undefined;
  createChat: () => string;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  clearChat: (id: string) => void;
  deleteAllChats: () => void;
  importChats: (chats: Chat[]) => void;

  send: (chatId: string | null, input: SendInput) => string;
  regenerate: (chatId: string, engineOverride?: EngineKind) => void;
  stop: (chatId: string) => void;
  isBusy: (chatId: string) => boolean;
  updateQuiz: (chatId: string, msgId: string, progress: QuizProgress) => void;

  toasts: Toast[];
  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <AppStoreProvider>");
  return s;
}

function sanitizeLoadedChats(chats: Chat[]): Chat[] {
  // A reload mid-stream leaves messages "thinking"/"streaming". Mark them stopped.
  return (Array.isArray(chats) ? chats : []).map((c) => ({
    ...c,
    messages: (c.messages ?? []).map((m) =>
      m.status === "thinking" || m.status === "streaming" ? { ...m, status: m.content ? "stopped" : "error", error: m.content ? undefined : "Interrupted" } : m,
    ),
  }));
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  // ── Settings ─────────────────────────────────
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = load<Partial<Settings> & Record<string, unknown>>(KEYS.settings, {});
    // Migrate v0.1 settings (browser-side Gemini keys are no longer used or stored)
    delete saved.geminiKey;
    delete saved.geminiModel;
    const engine = saved.engine === "demo" ? "demo" : "cloud";
    return { ...DEFAULT_SETTINGS, ...saved, engine, context: { ...DEFAULT_SETTINGS.context, ...(saved.context ?? {}) } } as Settings;
  });
  useEffect(() => {
    save(KEYS.settings, settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setContext = useCallback(
    (patch: Partial<LearningContext>) => setSettings((s) => ({ ...s, context: { ...s.context, ...patch } })),
    [],
  );

  // ── Theme ────────────────────────────────────
  const [systemLight, setSystemLight] = useState(() => matchMedia("(prefers-color-scheme: light)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const on = () => setSystemLight(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const resolvedTheme: "dark" | "light" = settings.theme === "system" ? (systemLight ? "light" : "dark") : settings.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? "#0e0f12" : "#f7f7f5");
  }, [resolvedTheme]);

  // ── OLIS Cloud health ────────────────────────
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");
  const [health, setHealth] = useState<CloudHealth | null>(null);
  const recheck = useCallback(() => {
    setCloudStatus("checking");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    void cloudHealth(ctrl.signal).then((h) => {
      clearTimeout(timer);
      setHealth(h);
      setCloudStatus(h?.ok ? "ready" : "unavailable");
    });
  }, []);
  useEffect(recheck, [recheck]);

  // ── Engine config ────────────────────────────
  // Cloud is used only when chosen AND reachable; otherwise the offline engine answers.
  const effectiveKind: EngineKind = settings.engine === "cloud" && cloudStatus === "ready" ? "cloud" : "demo";
  const engine: EngineConfig = useMemo(() => ({ kind: effectiveKind }), [effectiveKind]);
  const engineLabel =
    effectiveKind === "cloud"
      ? `OLIS Cloud · ${health?.model ?? "Gemini"}`
      : settings.engine === "cloud" && cloudStatus === "checking"
        ? "Connecting to OLIS Cloud…"
        : settings.engine === "cloud"
          ? "Offline · cloud unavailable"
          : "Demo engine · offline";

  // refs so the async runner always sees the latest settings/engine
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const engineRef = useRef(engine);
  engineRef.current = engine;


  // ── Toasts ───────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (text: string, kind: ToastKind = "info") => {
      const id = uid();
      setToasts((t) => [...t.slice(-2), { id, text, kind }]);
      setTimeout(() => dismissToast(id), kind === "error" ? 4200 : 2600);
    },
    [dismissToast],
  );

  // ── Chats ────────────────────────────────────
  const [chats, setChats] = useState<Chat[]>(() => sanitizeLoadedChats(load<Chat[]>(KEYS.chats, [])));
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // Debounced persistence (streaming updates are frequent)
  useEffect(() => {
    const t = setTimeout(() => {
      if (!save(KEYS.chats, chats)) toast("Couldn't save chat history. Browser storage may be full or blocked.", "error");
    }, 350);
    return () => clearTimeout(t);
  }, [chats, toast]);

  const sorted = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt), [chats]);
  const getChat = useCallback((id: string) => chats.find((c) => c.id === id), [chats]);

  const patchChat = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, []);
  const patchMsg = useCallback(
    (chatId: string, msgId: string, patch: Partial<Message>) =>
      patchChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) })),
    [patchChat],
  );

  const createChat = useCallback(() => {
    const now = Date.now();
    const chat: Chat = { id: uid(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
    setChats((cs) => [chat, ...cs]);
    return chat.id;
  }, []);

  const renameChat = useCallback(
    (id: string, title: string) => patchChat(id, (c) => ({ ...c, title: title.trim() || c.title, titleEdited: true })),
    [patchChat],
  );

  // ── Running generations ──────────────────────
  const controllers = useRef(new Map<string, AbortController>());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const isBusy = useCallback((id: string) => !!busy[id], [busy]);

  const stop = useCallback((chatId: string) => controllers.current.get(chatId)?.abort(), []);

  const deleteChat = useCallback(
    (id: string) => {
      stop(id);
      setChats((cs) => cs.filter((c) => c.id !== id));
    },
    [stop],
  );
  const clearChat = useCallback(
    (id: string) => {
      stop(id);
      patchChat(id, (c) => ({ ...c, messages: [], updatedAt: Date.now() }));
    },
    [patchChat, stop],
  );
  const deleteAllChats = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    setChats([]);
    remove(KEYS.chats);
  }, []);
  const importChats = useCallback((incoming: Chat[]) => {
    setChats((cs) => {
      const ids = new Set(cs.map((c) => c.id));
      return [...sanitizeLoadedChats(incoming).filter((c) => !ids.has(c.id)), ...cs];
    });
  }, []);

  const run = useCallback(
    async (chatId: string, assistantId: string, userMsg: Message, historyMsgs: Message[], kind: EngineKind) => {
      const ctrl = new AbortController();
      controllers.current.set(chatId, ctrl);
      setBusy((b) => ({ ...b, [chatId]: true }));

      const history = historyMsgs
        .filter((m) => (m.status === undefined || m.status === "done" || m.status === "stopped") && m.content.trim())
        .map((m) => ({ role: m.role, content: m.hiddenContext ? `${m.content}\n\n${m.hiddenContext}` : m.content }));

      let content = "";
      let last = 0;
      let finished = false;
      let pending: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (pending) clearTimeout(pending);
        pending = null;
        if (finished) return;
        last = performance.now();
        patchMsg(chatId, assistantId, { content, status: "streaming" });
      };
      const finish = () => {
        finished = true;
        if (pending) clearTimeout(pending);
        pending = null;
      };

      try {
        const gen = generateResponse(
          {
            input: userMsg.content,
            attachment: userMsg.hiddenContext,
            mode: userMsg.mode ?? "ask",
            context: settingsRef.current.context,
            history,
            signal: ctrl.signal,
          },
          { ...engineRef.current, kind },
        );
        for await (const ev of gen) {
          if (ev.type === "text") {
            content += ev.delta;
            // Throttle UI updates to ~25 fps
            if (performance.now() - last > 40) flush();
            else if (!pending) pending = setTimeout(flush, 40);
          } else if (ev.type === "step") {
            const step = { id: ev.id, label: ev.label, status: ev.status };
            patchChat(chatId, (c) => ({
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== assistantId) return m;
                const steps = [...(m.steps ?? [])];
                const i = steps.findIndex((s) => s.id === step.id);
                if (i >= 0) steps[i] = step;
                else steps.push(step);
                return { ...m, steps };
              }),
            }));
          } else if (ev.type === "sources") {
            patchMsg(chatId, assistantId, { sources: ev.sources });
          } else if (ev.type === "suggestions") {
            patchMsg(chatId, assistantId, { suggestions: ev.items });
          } else if (ev.type === "quiz") {
            patchMsg(chatId, assistantId, {
              quiz: ev.quiz,
              quizProgress: { answers: ev.quiz.questions.map(() => null), current: 0, finished: false },
            });
          }
        }
        finish();
        patchMsg(chatId, assistantId, { content, status: "done" });
      } catch (e) {
        finish();
        if (isAbort(e)) patchMsg(chatId, assistantId, { content, status: "stopped" });
        else {
          const msg = e instanceof OlisError ? e.message : "Something went wrong while generating a response. Please try again.";
          if (!(e instanceof OlisError)) console.error("[OLIS]", e);
          patchMsg(chatId, assistantId, { content, status: "error", error: msg });
        }
      } finally {
        controllers.current.delete(chatId);
        setBusy((b) => {
          const n = { ...b };
          delete n[chatId];
          return n;
        });
        patchChat(chatId, (c) => ({ ...c, updatedAt: Date.now() }));
      }
    },
    [patchMsg, patchChat],
  );

  const send = useCallback(
    (chatIdIn: string | null, input: SendInput) => {
      const now = Date.now();
      let chatId = chatIdIn;
      if (!chatId || !chatsRef.current.some((c) => c.id === chatId)) {
        chatId = uid();
        const chat: Chat = { id: chatId, title: "New chat", createdAt: now, updatedAt: now, messages: [] };
        chatsRef.current = [chat, ...chatsRef.current];
        setChats((cs) => [chat, ...cs]);
      }
      const existing = chatsRef.current.find((c) => c.id === chatId)!;
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: input.text,
        createdAt: now,
        mode: input.mode,
        attachment: input.attachment ? { name: input.attachment.name, chars: input.attachment.text.length } : undefined,
        hiddenContext: input.attachment ? `Attached file "${input.attachment.name}":\n\n${input.attachment.text}` : undefined,
      };
      const assistant: Message = { id: uid(), role: "assistant", content: "", createdAt: now + 1, status: "thinking", mode: input.mode };
      const history = existing.messages;
      const id = chatId;
      assistant.engine = engineRef.current.kind;
      patchChat(id, (c) => ({
        ...c,
        title: c.messages.length === 0 && !c.titleEdited ? titleFrom(input.text || input.attachment?.name || "New chat") : c.title,
        updatedAt: now,
        messages: [...c.messages, userMsg, assistant],
      }));
      void run(id, assistant.id, userMsg, history, engineRef.current.kind);
      return id;
    },
    [patchChat, run],
  );

  const regenerate = useCallback(
    (chatId: string, engineOverride?: EngineKind) => {
      const chat = chatsRef.current.find((c) => c.id === chatId);
      if (!chat || controllers.current.has(chatId)) return;
      const lastUserIdx = [...chat.messages].map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx < 0) return;
      const userMsg = chat.messages[lastUserIdx];
      const history = chat.messages.slice(0, lastUserIdx);
      const assistant: Message = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        status: "thinking",
        mode: userMsg.mode,
        engine: engineOverride ?? engineRef.current.kind,
      };
      patchChat(chatId, (c) => ({ ...c, messages: [...c.messages.slice(0, lastUserIdx + 1), assistant], updatedAt: Date.now() }));
      void run(chatId, assistant.id, userMsg, history, engineOverride ?? engineRef.current.kind);
    },
    [patchChat, run],
  );

  const rate = useCallback(
    (chatId: string, msgId: string, rating: "up" | "down") => {
      const chat = chatsRef.current.find((c) => c.id === chatId);
      const idx = chat?.messages.findIndex((m) => m.id === msgId) ?? -1;
      if (!chat || idx < 0) return;
      const msg = chat.messages[idx];
      const next = msg.feedback === rating ? undefined : rating;
      patchMsg(chatId, msgId, { feedback: next });
      if (!next) return;
      const question = [...chat.messages.slice(0, idx)].reverse().find((m) => m.role === "user")?.content ?? "";
      if (msg.engine === "cloud") {
        void sendFeedback({
          rating: next,
          question,
          answer: msg.content,
          mode: msg.mode,
          context: settingsRef.current.context,
          sources: msg.sources?.map((s) => ({ title: s.title, url: s.url })),
          engine: "cloud",
        });
      }
      toast(next === "up" ? "Thanks! Marked as helpful." : "Thanks. This helps OLIS improve.", "success");
    },
    [patchMsg, toast],
  );

  const updateQuiz = useCallback(
    (chatId: string, msgId: string, progress: QuizProgress) => patchMsg(chatId, msgId, { quizProgress: progress }),
    [patchMsg],
  );

  // Abort everything on unmount
  useEffect(() => {
    const map = controllers.current;
    return () => map.forEach((c) => c.abort());
  }, []);

  const value: Store = {
    settings,
    updateSettings,
    setContext,
    resolvedTheme,
    engine,
    engineLabel,
    cloud: { status: cloudStatus, health, recheck },
    rate,
    chats: sorted,
    getChat,
    createChat,
    renameChat,
    deleteChat,
    clearChat,
    deleteAllChats,
    importChats,
    send,
    regenerate,
    stop,
    isBusy,
    updateQuiz,
    toasts,
    toast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
