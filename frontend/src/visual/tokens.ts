/** Source palette: tale-loom DESIGN.md. Semantic assignments belong to Jev AI Lab. */
export const palette = {
  skyStart: "#0f0c29",
  skyMiddle: "#302b63",
  skyEnd: "#24243e",
  primary: "#f093fb",
  danger: "#f5576c",
  info: "#4facfe",
  success: "#43e97b",
  peach: "#fa709a",
  highlight: "#fee140",
  mint: "#a8edea",
  lavender: "#e0c3fc",
  secondary: "#c2e9fb",
} as const;
export type Quality = "standard" | "enhanced" | "cinematic" | "reduced";
export const qualityBudget = {
  standard: {
    dpr: 1,
    fps: 30,
    stars: 160,
    segments: 40,
    rings: 3,
    transmission: 0,
  },
  enhanced: {
    dpr: 1.5,
    fps: 60,
    stars: 360,
    segments: 64,
    rings: 4,
    transmission: 0.32,
  },
  cinematic: {
    dpr: 2,
    fps: 60,
    stars: 750,
    segments: 96,
    rings: 5,
    transmission: 0.52,
  },
  reduced: {
    dpr: 1,
    fps: 0,
    stars: 120,
    segments: 48,
    rings: 4,
    transmission: 0.2,
  },
} as const;
export const motion = {
  hoverMs: 180,
  entranceMs: 600,
  orbitSeconds: 18,
  cosmosSeconds: 90,
} as const;
export const materials = {
  alloy: { color: palette.skyMiddle, metalness: 0.72, roughness: 0.28 },
  pearl: {
    color: palette.lavender,
    metalness: 0.12,
    roughness: 0.17,
    clearcoat: 1,
    iridescence: 0.65,
    thickness: 0.65,
    ior: 1.35,
  },
  energy: {
    color: palette.primary,
    emissive: palette.primary,
    emissiveIntensity: 0.35,
    roughness: 0.28,
    metalness: 0.35,
  },
} as const;
