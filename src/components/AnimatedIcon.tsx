// Animated icons from Animate UI (animate-ui.com, MIT + Commons Clause),
// vendored under src/components/animate-ui. Use <HoverAnimate> around a button
// so hovering anywhere on the button plays the icon's animation.
import type { ReactElement } from "react";
import { AnimateIcon } from "./animate-ui/icons/icon";
import { LayoutDashboard } from "./animate-ui/icons/layout-dashboard";
import { MessageSquare } from "./animate-ui/icons/message-square";
import { MessageSquareText } from "./animate-ui/icons/message-square-text";
import { Clock } from "./animate-ui/icons/clock";
import { Layers } from "./animate-ui/icons/layers";
import { Settings } from "./animate-ui/icons/settings";
import { ArrowUp } from "./animate-ui/icons/arrow-up";
import { ArrowRight } from "./animate-ui/icons/arrow-right";
import { Paperclip } from "./animate-ui/icons/paperclip";
import { AudioLines } from "./animate-ui/icons/audio-lines";
import { Copy } from "./animate-ui/icons/copy";
import { Check } from "./animate-ui/icons/check";
import { RotateCw } from "./animate-ui/icons/rotate-cw";
import { ThumbsUp } from "./animate-ui/icons/thumbs-up";
import { ThumbsDown } from "./animate-ui/icons/thumbs-down";
import { Lightbulb } from "./animate-ui/icons/lightbulb";
import { List } from "./animate-ui/icons/list";
import { Sun } from "./animate-ui/icons/sun";
import { Moon } from "./animate-ui/icons/moon";
import { Search } from "./animate-ui/icons/search";
import { Trash2 } from "./animate-ui/icons/trash-2";
import { X } from "./animate-ui/icons/x";
import { Menu } from "./animate-ui/icons/menu";
import { ChevronDown } from "./animate-ui/icons/chevron-down";
import { Sparkles } from "./animate-ui/icons/sparkles";
import { ExternalLink } from "./animate-ui/icons/external-link";
import { Download } from "./animate-ui/icons/download";
import { Upload } from "./animate-ui/icons/upload";
import { Plus } from "./animate-ui/icons/plus";
import { Orbit } from "./animate-ui/icons/orbit";

const ICONS = {
  dashboard: LayoutDashboard,
  chat: MessageSquare,
  chatText: MessageSquareText,
  history: Clock,
  layers: Layers,
  settings: Settings,
  send: ArrowUp,
  arrowRight: ArrowRight,
  attach: Paperclip,
  voice: AudioLines,
  copy: Copy,
  check: Check,
  regenerate: RotateCw,
  thumbUp: ThumbsUp,
  thumbDown: ThumbsDown,
  lightbulb: Lightbulb,
  list: List,
  sun: Sun,
  moon: Moon,
  search: Search,
  trash: Trash2,
  x: X,
  menu: Menu,
  chevronDown: ChevronDown,
  sparkles: Sparkles,
  external: ExternalLink,
  download: Download,
  upload: Upload,
  plus: Plus,
  orbit: Orbit,
} as const;

export type AnimatedIconName = keyof typeof ICONS;

interface Props {
  name: AnimatedIconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Play continuously (e.g. mic while listening) */
  animate?: boolean;
  loop?: boolean;
  animateOnHover?: boolean;
}

export function AIcon({ name, size = 18, className, strokeWidth = 1.75, ...anim }: Props) {
  const C = ICONS[name];
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" {...anim} />;
}

/** Plays the child icon's animation when the wrapping element is hovered. */
export function HoverAnimate({ children }: { children: ReactElement }) {
  return (
    <AnimateIcon animateOnHover asChild>
      {children}
    </AnimateIcon>
  );
}
