/**
 * Jetons de design repris de `web/src/app/globals.css`.
 *
 * Les deux clients doivent se ressembler : meme violet, memes gris, memes
 * couleurs de statut. Toute divergence ici se verra immediatement quand un
 * apporteur passera du web au mobile.
 */
export const colors = {
  background: "#f5f6f9",
  surface: "#ffffff",
  surfaceRaised: "#fafbfd",

  primary: "#9600c0",
  primaryStrong: "#7800a0",
  primarySubtle: "#f5eafc",
  primaryMuted: "#e8d0f8",

  muted: "#eef0f5",
  border: "#e2e5ee",
  borderStrong: "#c5c9d8",

  textStrong: "#0d0f17",
  textBody: "#2a2e3d",
  textMuted: "#565c70",
  textFaint: "#838aa0",

  success: "#059669",
  successBg: "#ecfdf5",
  warning: "#d97706",
  warningBg: "#fffbeb",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  info: "#2563eb",
  infoBg: "#eff6ff",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
