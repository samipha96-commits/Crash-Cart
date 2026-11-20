import type { Hospital, HospitalTheme, ThemePreset } from "./types";

/** Brand palettes a hospital portal can start from (light background, main colour). */
export const THEME_PRESETS: Record<ThemePreset, { label: string; primary: string; bg: string; surface2: string; line: string }> = {
  teal: { label: "Teal", primary: "#0e6b66", bg: "#f3efe6", surface2: "#f8f3ea", line: "#e4d9c8" },
  navy: { label: "Navy", primary: "#1d3f72", bg: "#eef1f6", surface2: "#f3f6fa", line: "#d6deea" },
  crimson: { label: "Crimson", primary: "#9b1c31", bg: "#f6efef", surface2: "#faf4f4", line: "#ead6d8" },
  emerald: { label: "Emerald", primary: "#14713f", bg: "#eef4ef", surface2: "#f3f8f4", line: "#d4e5d8" },
  plum: { label: "Plum", primary: "#6a2c7a", bg: "#f4eff6", surface2: "#f8f4fa", line: "#e3d7e8" },
  amber: { label: "Amber", primary: "#9a5b00", bg: "#f7f1e6", surface2: "#fbf6ec", line: "#ecdcc0" },
  slate: { label: "Slate", primary: "#334155", bg: "#f1f3f5", surface2: "#f6f7f9", line: "#dde1e6" },
};

const RADIUS = { rounded: "14px", soft: "8px", square: "2px" } as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, other: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  if (!a || !b) return hex;
  const c = a.map((v, i) => Math.round(v * (1 - amount) + b[i] * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function isHexColor(v: string | undefined): v is string {
  return !!v && hexToRgb(v) !== null;
}

/** The CSS variables for a hospital's portal, in light or dark mode. */
export function themeVars(theme: HospitalTheme | undefined, dark: boolean): Record<string, string> {
  const t = theme ?? {};
  const preset = THEME_PRESETS[t.preset ?? "teal"] ?? THEME_PRESETS.teal;
  const primary = isHexColor(t.primary) ? t.primary : preset.primary;
  const vars: Record<string, string> = {
    "--radius": RADIUS[t.corners ?? "rounded"],
    "--display": t.headings === "sans" ? 'var(--font)' : '"Fraunces", Georgia, serif',
    "--pad": t.density === "compact" ? "10px" : "14px",
  };
  if (dark) {
    vars["--primary"] = mix(primary, "#ffffff", 0.45);
    vars["--primary-ink"] = mix(primary, "#000000", 0.75);
    vars["--primary-soft"] = mix(primary, "#121816", 0.72);
  } else {
    vars["--primary"] = primary;
    vars["--primary-ink"] = "#ffffff";
    vars["--primary-soft"] = mix(primary, "#ffffff", 0.86);
    vars["--bg"] = preset.bg;
    vars["--surface-2"] = preset.surface2;
    vars["--line"] = preset.line;
  }
  return vars;
}

const APPLIED = ["--radius", "--display", "--pad", "--primary", "--primary-ink", "--primary-soft", "--bg", "--surface-2", "--line"];

/** Applies (or clears, with null) a hospital's look to the whole page. */
export function applyTheme(h: Pick<Hospital, "theme"> | null) {
  const root = document.documentElement;
  for (const k of APPLIED) root.style.removeProperty(k);
  if (!h) return;
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  for (const [k, v] of Object.entries(themeVars(h.theme, dark))) root.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeVars(h.theme, false)["--primary"]);
}

/** Shrinks an uploaded logo to at most 256 px and returns it as a PNG data URL (kept small for the database). */
export async function logoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG or SVG).");
  if (file.size > 5_000_000) throw new Error("That image is over 5 MB. Choose a smaller logo.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image."));
      i.src = url;
    });
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth || 256, img.naturalHeight || 256));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 256) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 256) * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
