/**
 * Desktop UI Theme Variables - Gemini & Obsidian Fusion
 * Exact 1:1 match with Ultron Desktop design system
 */
export const colors = {
  // Backgrounds - Pure Obsidian & Charcoal Fusion
  background: '#000000',
  surface: '#131314',
  surfaceSubtle: '#18181b',
  surfaceElevated: '#1f1f23',
  surfaceActive: '#27272a',
  surfaceGlass: 'rgba(19, 19, 20, 0.88)',

  // Accents & Brand
  accentWhite: '#FFFFFF',
  primary: '#FFFFFF', // Desktop uses crisp white for primary action buttons
  primaryMuted: 'rgba(255, 255, 255, 0.1)',
  primaryGlow: 'rgba(255, 255, 255, 0.25)',
  secondary: '#3B82F6',
  secondaryMuted: 'rgba(59, 130, 246, 0.15)',

  // Status & Telemetry
  success: '#10B981',
  successMuted: 'rgba(16, 185, 129, 0.12)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.12)',
  error: '#EF4444',
  errorMuted: 'rgba(239, 68, 68, 0.12)',
  info: '#3B82F6',

  // Text Hierarchies
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textGhost: '#374151',

  // UI Borders & Outlines
  border: '#1A1A1A',
  borderLight: '#262626',
  borderHighlight: 'rgba(255, 255, 255, 0.18)',
  borderMuted: '#141414',

  // Chat Bubbles & Code
  userBubble: '#212124',
  userBubbleText: '#F3F4F6',
  assistantBubble: '#131314',
  assistantBubbleText: '#F3F4F6',
  codeBackground: '#0A0A0B',
};

export type Colors = typeof colors;
