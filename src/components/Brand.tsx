// OLIS brand: vector recreation of the official logo (four-point star inside
// an orbit). Colours come from theme tokens so it works in light and dark.
import { useId } from "react";
import { cx } from "../lib/utils";

/** The OLIS mark on its own. `framed` puts it on a soft tile (avatars, favicon-like uses). */
export function OlisMark({ size = 28, className, framed = true }: { size?: number; className?: string; framed?: boolean }) {
  const id = useId().replace(/:/g, "");
  const px = framed ? size * 0.8 : size;
  const bold = px < 40; // thicker orbit so it stays legible at icon sizes
  const svg = (
    <svg width={px} height={px * 1.04} viewBox="0 0 100 104" className={framed ? undefined : className} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="6" y1="52" x2="94" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--c-orbit-a)" />
          <stop offset="1" stopColor="var(--c-orbit-b)" />
        </linearGradient>
        <mask id={`m${id}`}>
          <ellipse cx="50" cy="52" rx="46" ry={bold ? 17 : 15.5} fill="#fff" />
          <ellipse cx={bold ? 47.6 : 48.2} cy={bold ? 53.4 : 52.9} rx={bold ? 41.6 : 43.6} ry={bold ? 11 : 12.6} fill="#000" />
        </mask>
      </defs>
      {/* Orbit: tilted crescent, thin on the left, thickening to the right */}
      <g transform="rotate(-17 50 52)">
        <rect x="0" y="28" width="100" height="48" fill={`url(#g${id})`} mask={`url(#m${id})`} />
      </g>
      {/* Four-point star with long, fine vertical rays */}
      <path
        fill="var(--c-text)"
        d={
          bold
            ? "M50 3C51 26 52.6 41 55.6 46.4 58.8 49.6 64.5 51 72 52 64.5 53 58.8 54.4 55.6 57.6 52.6 63 51 78 50 101 49 78 47.4 63 44.4 57.6 41.2 54.4 35.5 53 28 52 35.5 51 41.2 49.6 44.4 46.4 47.4 41 49 26 50 3Z"
            : "M50 1C50.8 26 52 42 54.6 47.4 57.6 50 63 51.3 69.5 52 63 52.7 57.6 54 54.6 56.6 52 62 50.8 78 50 103 49.2 78 48 62 45.4 56.6 42.4 54 37 52.7 30.5 52 37 51.3 42.4 50 45.4 47.4 48 42 49.2 26 50 1Z"
        }
      />
    </svg>
  );
  if (!framed) return svg;
  return (
    <span
      className={cx("inline-grid shrink-0 place-items-center rounded-[28%] border border-line bg-surface-2", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {svg}
    </span>
  );
}

/** Full lockup: mark + OLIS wordmark + "Orbix Learning Intelligence System". */
export function OlisLockup({ size = "md", className, beta = true }: { size?: "sm" | "md" | "lg"; className?: string; beta?: boolean }) {
  const s = { sm: { mark: 30, word: "text-[17px]", sub: "text-[10px] !tracking-[0.01em]" }, md: { mark: 44, word: "text-[24px]", sub: "text-[11.5px]" }, lg: { mark: 64, word: "text-[34px]", sub: "text-[13px]" } }[size];
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <OlisMark size={s.mark} framed={false} />
      <div className="min-w-0 leading-none">
        <div className="flex items-center gap-2">
          <span className={cx(s.word, "font-medium tracking-[0.16em]")}>OLIS</span>
          {beta && <span className="badge-beta">BETA</span>}
        </div>
        <div className={cx(s.sub, "mt-1.5 truncate tracking-[0.06em] text-muted")}>Orbix Learning Intelligence System</div>
      </div>
    </div>
  );
}

export const CREATOR = {
  name: "Udula",
  handle: "UDULAIW",
  github: "https://github.com/udulaiw",
};
