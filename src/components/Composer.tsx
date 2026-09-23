import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import type { Mode } from "../types";
import { MODE_META } from "../services/intent";
import { useStore, type SendInput } from "../store/AppStore";
import { Icon, type IconName } from "./Icon";
import { AIcon, HoverAnimate } from "./AnimatedIcon";
import { Orb } from "./Orb";
import { cx } from "../lib/utils";
import { IMAGE_ACCEPT, isImageFile, prepareImage, type PreparedImage } from "../lib/image";

const QUICK: { mode: Exclude<Mode, "ask" | "simplify">; icon: IconName }[] = [
  { mode: "explain", icon: "lightbulb" },
  { mode: "solve", icon: "sigma" },
  { mode: "quiz", icon: "target" },
  { mode: "plan", icon: "calendar" },
  { mode: "summarize", icon: "text" },
];

const MAX_ATTACH = 60_000;
const MAX_IMAGES = 2;

// Minimal typing for the Web Speech API (not in lib.dom for all TS versions)
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRec;
const getSpeech = (): SpeechCtor | undefined =>
  (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;

export interface ComposerHandle {
  setDraft: (text: string, mode?: Mode) => void;
  focus: () => void;
}

interface Props {
  onSend: (input: SendInput) => void;
  busy?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  variant?: "hero" | "dock";
}

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ onSend, busy, onStop, autoFocus, variant = "dock" }, ref) {
  const { toast } = useStore();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("ask");
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [listening, setListening] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const rec = useRef<SpeechRec | null>(null);
  const baseText = useRef("");

  const autosize = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, []);
  useEffect(autosize, [text, autosize]);

  useImperativeHandle(ref, () => ({
    setDraft: (t, m) => {
      setText(t);
      if (m) setMode(m);
      requestAnimationFrame(() => {
        ta.current?.focus();
        ta.current?.setSelectionRange(t.length, t.length);
      });
    },
    focus: () => ta.current?.focus(),
  }));

  useEffect(() => {
    if (autoFocus && matchMedia("(min-width: 768px)").matches) ta.current?.focus();
  }, [autoFocus]);

  // Stop the mic if the component unmounts
  useEffect(() => () => rec.current?.stop(), []);

  const canSend = !busy && !preparing && (text.trim().length > 0 || !!attachment || images.length > 0);

  const submit = () => {
    if (!canSend) return;
    if (listening) rec.current?.stop();
    onSend({ text: text.trim(), mode, attachment: attachment ?? undefined, images: images.length ? images : undefined });
    setText("");
    setAttachment(null);
    setImages([]);
    setMode("ask");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && mode !== "ask") setMode("ask");
  };

  const pickMode = (m: Exclude<Mode, "ask">) => {
    if (mode === m) {
      setMode("ask");
      if (text === MODE_META[m].prefix) setText("");
      return;
    }
    setMode(m);
    const prevPrefix = mode !== "ask" ? MODE_META[mode].prefix : "";
    const body = prevPrefix && text.startsWith(prevPrefix) ? text.slice(prevPrefix.length) : text;
    const next = body.trim() ? (MODE_META[m].prefix && !body.startsWith(MODE_META[m].prefix) ? MODE_META[m].prefix + body : body) : MODE_META[m].prefix;
    setText(next);
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(next.length, next.length);
    });
  };

  const addImages = async (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast(`You can attach up to ${MAX_IMAGES} images per message.`, "error");
      return;
    }
    if (files.length > room) toast(`Only the first ${room} image${room > 1 ? "s" : ""} will be attached.`);
    setPreparing(true);
    try {
      const prepared: PreparedImage[] = [];
      for (const f of files.slice(0, room)) prepared.push(await prepareImage(f, f.name || "Pasted image"));
      setImages((cur) => [...cur, ...prepared].slice(0, MAX_IMAGES));
      ta.current?.focus();
    } catch {
      toast("Couldn't read that image. Try a JPEG or PNG.", "error");
    } finally {
      setPreparing(false);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    void addImages(files);
  };

  const onFile = async (list: FileList | null | undefined) => {
    const all = Array.from(list ?? []);
    const imgs = all.filter(isImageFile);
    if (imgs.length) {
      await addImages(imgs);
      return;
    }
    const f = all[0];
    if (!f) return;
    const okType = /\.(txt|md|markdown|csv|json|tex)$/i.test(f.name) || f.type.startsWith("text/");
    if (!okType) {
      toast("OLIS Beta reads photos (JPEG, PNG, WebP) and text files (.txt, .md, .csv). PDF support is coming later.", "error");
      return;
    }
    try {
      let content = await f.text();
      if (!content.trim()) {
        toast("That file looks empty.", "error");
        return;
      }
      if (content.length > MAX_ATTACH) {
        content = content.slice(0, MAX_ATTACH);
        toast(`Large file: using the first ${MAX_ATTACH.toLocaleString()} characters.`);
      }
      setAttachment({ name: f.name, text: content });
      if (!text.trim()) setMode("summarize");
      ta.current?.focus();
    } catch {
      toast("Couldn't read that file.", "error");
    }
  };

  const toggleVoice = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getSpeech();
    if (!Ctor) {
      toast("Voice input isn't supported in this browser. Try Chrome, Edge or Safari.", "error");
      return;
    }
    try {
      const r = new Ctor();
      r.lang = navigator.language || "en-US";
      r.interimResults = true;
      r.continuous = false;
      baseText.current = text ? text.replace(/\s*$/, " ") : "";
      r.onresult = (e) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        setText(baseText.current + transcript);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone access was blocked. Allow it in your browser to use voice input.", "error");
        else if (e.error !== "no-speech" && e.error !== "aborted") toast("Voice input stopped: " + e.error, "error");
      };
      r.onend = () => {
        setListening(false);
        rec.current = null;
        ta.current?.focus();
      };
      rec.current = r;
      r.start();
      setListening(true);
    } catch {
      toast("Couldn't start voice input.", "error");
    }
  };

  const placeholder = listening ? "Listening… speak now" : mode === "ask" ? "Ask OLIS anything about your learning..." : MODE_META[mode].placeholder;

  return (
    <div className="w-full">
      <div
        className={cx(
          "card relative flex flex-col gap-1 !rounded-[22px] px-2 pb-2 pt-2 transition-[border-color,box-shadow] duration-200 focus-within:border-line-strong",
          variant === "hero" && "shadow-pop",
        )}
      >
        {(attachment || images.length > 0 || preparing || mode !== "ask") && (
          <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
            {mode !== "ask" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                {MODE_META[mode].label} mode
                <button onClick={() => setMode("ask")} aria-label="Exit mode" className="opacity-70 hover:opacity-100">
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              </span>
            )}
            {images.map((img, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-xs text-muted">
                <img src={img.thumb} alt="" className="h-6 w-6 rounded-full object-cover" />
                <span className="max-w-[9rem] truncate">{img.name}</span>
                <button onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${img.name}`} className="hover:text-ink">
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              </span>
            ))}
            {preparing && <span className="text-xs text-faint">Preparing image…</span>}
            {attachment && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-muted">
                <Icon name="file" size={13} />
                <span className="truncate">{attachment.name}</span>
                <span className="text-faint">· {Math.round(attachment.text.length / 1000) || "<1"}k chars</span>
                <button onClick={() => setAttachment(null)} aria-label="Remove attachment" className="hover:text-ink">
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              </span>
            )}
          </div>
        )}

        <textarea
          ref={ta}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder={placeholder}
          aria-label="Message OLIS"
          className={cx(
            "w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none placeholder:text-faint",
            variant === "hero" ? "min-h-[64px]" : "min-h-[44px]",
          )}
        />

        <div className="flex items-center gap-1 px-1">
          <input
            ref={file}
            type="file"
            multiple
            className="hidden"
            accept={`${IMAGE_ACCEPT},.txt,.md,.markdown,.csv,.json,.tex,text/*`}
            onChange={(e) => {
              void onFile(e.target.files);
              e.target.value = "";
            }}
          />
          <HoverAnimate>
            <button className="icon-btn" onClick={() => file.current?.click()} title="Attach a photo or text file" aria-label="Attach a photo or text file">
              <AIcon name="attach" />
            </button>
          </HoverAnimate>
          <HoverAnimate>
            <button
              className={cx("icon-btn", listening && "!w-auto gap-1.5 bg-danger-soft px-2 !text-danger")}
              onClick={toggleVoice}
              title={listening ? "Stop listening" : "Voice input"}
              aria-label={listening ? "Stop listening" : "Voice input"}
              aria-pressed={listening}
            >
              {listening ? (
                <>
                  <Orb state="listening" size={20} label="Listening" />
                  <span className="text-xs font-medium">Listening</span>
                </>
              ) : (
                <Icon name="mic" />
              )}
            </button>
          </HoverAnimate>
          <span className="ml-1 hidden text-[11px] text-faint sm:inline">
            <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift + Enter</kbd> new line
          </span>
          <div className="ml-auto">
            {busy && onStop ? (
              <button className="grid h-9 w-9 place-items-center rounded-full bg-ink text-bg transition hover:opacity-85" onClick={onStop} aria-label="Stop generating" title="Stop generating">
                <Icon name="stop" size={14} strokeWidth={3} />
              </button>
            ) : (
              <HoverAnimate>
                <button
                  className="grid h-9 w-9 place-items-center rounded-full bg-ink text-bg transition enabled:hover:scale-105 enabled:hover:opacity-90 disabled:opacity-25"
                  onClick={submit}
                  disabled={!canSend}
                  aria-label="Send"
                  title="Send"
                >
                  <AIcon name="send" size={17} strokeWidth={2.2} />
                </button>
              </HoverAnimate>
            )}
          </div>
        </div>
      </div>

      <div
        className={cx(
          "mt-3 flex items-center gap-2",
          variant === "dock" ? "no-scrollbar -mx-4 flex-nowrap justify-start overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 [&>*]:shrink-0" : "flex-wrap justify-center",
        )}
        role="group"
        aria-label="Quick actions"
      >
        {QUICK.map((q) => (
          <button key={q.mode} className="chip" aria-pressed={mode === q.mode} onClick={() => pickMode(q.mode)}>
            <Icon name={q.icon} size={14} />
            {MODE_META[q.mode].label}
          </button>
        ))}
      </div>
    </div>
  );
});
