// OLIS brand: vector recreation of the official logo (four-point star inside
// an orbit). Colours come from theme tokens so it works in light and dark.
import { useId } from "react";
import { useReducedMotion } from "motion/react";
import { cx } from "../lib/utils";

/**
 * How alive the mark is.
 * - "full":  star breathes + twinkles, a comet travels the orbit, a sheen sweeps it (the "current" OLIS)
 * - "calm":  star breathes only (older chat avatars, so long chats stay quiet and cheap)
 * - false:   static (favicons, exports)
 * Everything falls back to static under prefers-reduced-motion.
 */
export type MarkLife = "full" | "calm" | false;

const STAR_BOLD =
  "M50 3C51 26 52.6 41 55.6 46.4 58.8 49.6 64.5 51 72 52 64.5 53 58.8 54.4 55.6 57.6 52.6 63 51 78 50 101 49 78 47.4 63 44.4 57.6 41.2 54.4 35.5 53 28 52 35.5 51 41.2 49.6 44.4 46.4 47.4 41 49 26 50 3Z";
const STAR_FINE =
  "M50 1C50.8 26 52 42 54.6 47.4 57.6 50 63 51.3 69.5 52 63 52.7 57.6 54 54.6 56.6 52 62 50.8 78 50 103 49.2 78 48 62 45.4 56.6 42.4 54 37 52.7 30.5 52 37 51.3 42.4 50 45.4 47.4 48 42 49.2 26 50 1Z";
// Centre line of the orbit crescent (before the -17° tilt). Two arcs = one full loop.
const ORBIT_PATH = "M6 52.6a44 13.6 0 1 0 88 0a44 13.6 0 1 0 -88 0";

/** The OLIS mark on its own. `framed` puts it on a soft tile (avatars, favicon-like uses). */
export function OlisMark({
  size = 28,
  className,
  framed = true,
  alive = "calm",
  arrive = false,
}: {
  size?: number;
  className?: string;
  framed?: boolean;
  alive?: MarkLife;
  /** Play the one-off "spin in" when the mark first appears (e.g. an answer just finished). */
  arrive?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const life: MarkLife = reduce ? false : alive;
  const px = framed ? size * 0.8 : size;
  const bold = px < 40; // thicker orbit so it stays legible at icon sizes
  const star = bold ? STAR_BOLD : STAR_FINE;
  const comet = bold ? 5 : 3.2; // comet radius in viewBox units; bigger when the mark is tiny

  const svg = (
    <svg
      width={px}
      height={px * 1.04}
      viewBox="0 0 100 104"
      className={cx("olis-mark", life && `olis-${life}`, arrive && !reduce && "olis-arrive", !framed && className)}
      aria-hidden="true"
      overflow="visible"
    >
      <defs>
        <linearGradient id={`g${id}`} x1="6" y1="52" x2="94" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--c-orbit-a)" />
          <stop offset="1" stopColor="var(--c-orbit-b)" />
        </linearGradient>
        <mask id={`m${id}`}>
          <ellipse cx="50" cy="52" rx="46" ry={bold ? 17 : 15.5} fill="#fff" />
          <ellipse cx={bold ? 47.6 : 48.2} cy={bold ? 53.4 : 52.9} rx={bold ? 41.6 : 43.6} ry={bold ? 11 : 12.6} fill="#000" />
        </mask>
        {life === "full" && (
          <>
            {/* A band of light that slides along the orbit */}
            <linearGradient id={`s${id}`} x1="-30" y1="0" x2="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
              <animateTransform attributeName="gradientTransform" type="translate" values="0 0; 160 0; 160 0" keyTimes="0; 0.55; 1" dur="4.8s" repeatCount="indefinite" />
            </linearGradient>
            <radialGradient id={`c${id}`}>
              <stop offset="0" stopColor="var(--c-text)" stopOpacity="0.95" />
              <stop offset="0.45" stopColor="var(--c-orbit-b)" stopOpacity="0.55" />
              <stop offset="1" stopColor="var(--c-orbit-b)" stopOpacity="0" />
            </radialGradient>
          </>
        )}
        {life && (
          <filter id={`b${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={bold ? 3.2 : 2.4} />
          </filter>
        )}
      </defs>

      {/* Orbit: tilted crescent, thin on the left, thickening to the right */}
      <g transform="rotate(-17 50 52)">
        <rect x="0" y="28" width="100" height="48" fill={`url(#g${id})`} mask={`url(#m${id})`} />
        {life === "full" && (
          <>
            <rect x="0" y="28" width="100" height="48" fill={`url(#s${id})`} mask={`url(#m${id})`} className="olis-sheen" />
            {/* Comet: soft halo + bright core riding the orbit */}
            <g className="olis-comet">
              <circle r={comet * 2.4} fill={`url(#c${id})`} />
              <circle r={comet * 0.62} fill="var(--c-text)" />
              <animateMotion dur="6.5s" repeatCount="indefinite" path={ORBIT_PATH} />
            </g>
          </>
        )}
      </g>

      {/* Four-point star with long, fine vertical rays */}
      <g className="olis-star">
        {life && <path d={star} fill="var(--c-text)" filter={`url(#b${id})`} className="olis-glow" />}
        <path d={star} fill="var(--c-text)" />
      </g>
    </svg>
  );
  if (!framed) return svg;
  return (
    <span
      className={cx("olis-tile inline-grid shrink-0 place-items-center rounded-[28%] border border-line bg-surface-2", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {svg}
    </span>
  );
}

/** Full lockup: mark + OLIS wordmark + "Orbix Learning Intelligence System". */
export function OlisLockup({
  size = "md",
  className,
  beta = true,
  alive = "calm",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  beta?: boolean;
  alive?: MarkLife;
}) {
  const s = { sm: { mark: 30, word: "text-[17px]", sub: "text-[10px] !tracking-[0.01em]" }, md: { mark: 44, word: "text-[24px]", sub: "text-[11.5px]" }, lg: { mark: 64, word: "text-[34px]", sub: "text-[13px]" } }[size];
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <OlisMark size={s.mark} framed={false} alive={alive} />
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
