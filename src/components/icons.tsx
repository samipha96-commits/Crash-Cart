import type { ReactNode } from "react";

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  home: () => (
    <Svg>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Svg>
  ),
  cart: () => (
    <Svg>
      <rect x="4" y="3" width="16" height="15" rx="2" />
      <path d="M4 8h16M4 13h16M10 5.5h4M10 10.5h4M10 15.5h4" />
      <circle cx="7" cy="20.5" r="1.3" />
      <circle cx="17" cy="20.5" r="1.3" />
    </Svg>
  ),
  check: () => (
    <Svg>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2.8h6V4M8.5 12.5l2.2 2.2 4.8-4.8" />
    </Svg>
  ),
  clock: () => (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  more: () => (
    <Svg>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </Svg>
  ),
  pill: () => (
    <Svg>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="m9.2 8 5.6 8" />
    </Svg>
  ),
  users: () => (
    <Svg>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" />
      <path d="M16 4.8a3.2 3.2 0 0 1 0 6.3M18 14.9c1.6.6 2.7 2.2 3 5.1" />
    </Svg>
  ),
  settings: () => (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3Z" />
    </Svg>
  ),
  plus: () => (
    <Svg size={18}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  close: () => (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  chevron: () => (
    <Svg size={18}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  ),
  back: () => (
    <Svg size={18}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  ),
  download: () => (
    <Svg size={18}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  ),
  print: () => (
    <Svg size={18}>
      <path d="M7 9V3h10v6M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3" />
      <rect x="7" y="14" width="10" height="7" />
    </Svg>
  ),
  logout: () => (
    <Svg size={18}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </Svg>
  ),
  bolt: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" fill="currentColor" />
    </svg>
  ),
};

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#f4fffd" />
      </svg>
    </span>
  );
}
