/**
 * Design tokens ported 1:1 from packages/salve-db-studio/ui/src/styles.css
 * (the Studio's Tailwind @theme block) — single source of truth for the
 * example app's UI kit. Dark-only, single-accent, matching the Studio.
 */
export const colors = {
  canvas: '#0d0d0d',
  surface: '#151617',
  surface2: '#1c1e1f',
  line: '#292b2c',
  lineStrong: '#3a3d3e',
  ink: '#f4f5f6',
  muted: '#9198a1',
  accent: '#22d16c',
  accentStrong: '#43da82',
  accentInk: '#051b0c',
  ok: '#22d16c',
  danger: '#fb7175',
  brandYellow: '#ffdf00',
  brandNavy: '#0038a9',
} as const;

/** Translucent variants of the tokens above — mirrors Tailwind's `/NN` opacity-slash syntax used throughout the Studio (bg-accent/15, border-danger/30, etc). */
export const alpha = {
  accent10: 'rgba(34, 209, 108, 0.1)',
  accent15: 'rgba(34, 209, 108, 0.15)',
  accent30: 'rgba(34, 209, 108, 0.3)',
  danger10: 'rgba(251, 113, 117, 0.1)',
  danger30: 'rgba(251, 113, 117, 0.3)',
  ok10: 'rgba(34, 209, 108, 0.1)',
  ok25: 'rgba(34, 209, 108, 0.25)',
  pending10: 'rgba(255, 223, 0, 0.1)',
  pending30: 'rgba(255, 223, 0, 0.3)',
  white5: 'rgba(255, 255, 255, 0.05)',
  white10: 'rgba(255, 255, 255, 0.1)',
} as const;

/** 4px grid, matching the Studio's Tailwind spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Studio uses rounded-md (6px) for controls, rounded-lg (8px) for cards/panels, rounded-full for pills/dots. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
  mono: { fontFamily: 'Menlo', fontSize: 13 },
};

/** House animation durations from the Studio's motion/react usage (0.12–0.2s). */
export const motion = {
  fast: 120,
  base: 150,
  slow: 200,
  pulse: 1400,
} as const;
