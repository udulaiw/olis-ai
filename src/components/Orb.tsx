// Thinking orbs (thinking-orbs by Jakub Antalik, MIT) mapped to what OLIS is doing.
import { ThinkingOrb } from "thinking-orbs";
import type { Mode } from "../types";

export type OrbState = "working" | "searching" | "solving" | "listening" | "connecting" | "weaving" | "composing" | "breathing" | "shaping";

/** Pick the orb for an agent step label ("Searching Wikipedia…", "Reading bbc.co.uk"…). */
export function orbForStep(label: string): OrbState {
  const l = label.toLowerCase();
  if (/reading|read /.test(l)) return "weaving";
  if (/web|trusted sites/.test(l)) return "connecting";
  if (/wikipedia|search|checking|notes/.test(l)) return "searching";
  if (/question|quiz|wrote/.test(l)) return "solving";
  return "working";
}

/** Pick the orb for a mode while OLIS is thinking before any text arrives. */
export function orbForMode(mode?: Mode): OrbState {
  switch (mode) {
    case "solve":
      return "solving";
    case "plan":
      return "shaping";
    case "summarize":
      return "weaving";
    case "quiz":
      return "solving";
    case "explain":
    case "simplify":
      return "searching";
    default:
      return "working";
  }
}

export function Orb({ state, size = 20, label, className, speed }: { state: OrbState; size?: 20 | 32 | 64; label?: string; className?: string; speed?: number }) {
  return <ThinkingOrb state={state} size={size} theme="auto" speed={speed} aria-label={label} className={className} />;
}
