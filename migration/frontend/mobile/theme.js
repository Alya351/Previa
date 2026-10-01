// ============================================================================
// PREVIA Mobile Design System — Charte Graphique Officielle
// Couleurs extraites directement du logo officiel PREVIA (échantillonnage pixel)
// ============================================================================

export const PREVIA_COLORS = {
  // Palette officielle PREVIA & Neons Cyber-Sécurité
  bluePrimary: '#00A8FF',     // Bleu néon actif
  blueDeep: '#013A81',        // Accent profond
  blueMedium: '#1E88E5',      // Transitions dégradés
  cyanGlow: '#00F2FE',        // Halo luminescent IA
  emeraldSuccess: '#10B981',   // Validation / Service OK
  navyText: '#0F172A',        // Texte mode clair
  nearBlack: '#0B0F17',       // Fond sombre ultra-deep
  redAlert: '#FF0055',        // Alerte critique néon
  bgLight: '#F1F5F9',         // Fond général mode clair
  white: '#FFFFFF',

  // Couleurs de sévérité calibrées
  severityCritical: '#FF0055',
  severityHigh: '#F59E0B',
  severityInfo: '#00A8FF',

  // Actions rapides ergonomiques
  actionVerify: '#10B981',
  actionReject: '#64748B',
  actionWarning: '#F59E0B',

  // Mode sombre ultra-premium (Glassmorphism & OLED pitch black)
  darkBackground: '#0B0F17',
  darkSurface: '#151C28',
  darkSurfaceElevated: '#1E293B',
  darkBorder: 'rgba(255, 255, 255, 0.08)',
  darkBorderGlow: 'rgba(0, 168, 255, 0.25)',
  darkTextPrimary: '#F8FAFC',
  darkTextSecondary: '#94A3B8',
};

// Échelle typographique
export const PREVIA_TYPOGRAPHY = {
  fontFamily: 'Inter',
  fontFamilyMono: 'JetBrains Mono',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

// Rayons de bordure (coins arrondis généreux 16-20px)
export const PREVIA_RADIUS = {
  sm: 8,
  md: 14,
  card: 18,
  button: 18,
  pill: 999,
};

// Cible tactile minimale (Norme Apple HIG / Material Design : 44x44 pt)
export const PREVIA_TOUCH_TARGET = {
  minWidth: 44,
  minHeight: 44,
};

// Thèmes sémantiques (Clair / Sombre)
export function getTheme(mode = 'light') {
  const isDark = mode === 'dark';

  return {
    isDark,
    colors: {
      primary: PREVIA_COLORS.bluePrimary,
      primaryDeep: PREVIA_COLORS.blueDeep,
      primaryMedium: PREVIA_COLORS.blueMedium,
      alert: PREVIA_COLORS.redAlert,

      background: isDark ? PREVIA_COLORS.darkBackground : PREVIA_COLORS.bgLight,
      surface: isDark ? PREVIA_COLORS.darkSurface : PREVIA_COLORS.white,
      surfaceElevated: isDark ? PREVIA_COLORS.darkSurfaceElevated : PREVIA_COLORS.white,
      border: isDark ? PREVIA_COLORS.darkBorder : '#E5E7EB',

      textPrimary: isDark ? PREVIA_COLORS.darkTextPrimary : PREVIA_COLORS.navyText,
      textSecondary: isDark ? PREVIA_COLORS.darkTextSecondary : PREVIA_COLORS.graySecondary,
      textMuted: isDark ? '#6B7280' : '#9CA3AF',

      tabBarBackground: PREVIA_COLORS.nearBlack,
      tabBarActive: PREVIA_COLORS.bluePrimary,
      tabBarInactive: isDark ? '#6B7280' : '#9CA3AF',

      badgeRed: PREVIA_COLORS.redAlert,
      badgeText: '#FFFFFF',

      // Sévérité
      severityCritical: PREVIA_COLORS.severityCritical,
      severityHigh: PREVIA_COLORS.severityHigh,
      severityInfo: PREVIA_COLORS.severityInfo,

      // Actions d'acquittement
      actionVerify: PREVIA_COLORS.actionVerify,
      actionReject: PREVIA_COLORS.actionReject,
    },
    typography: PREVIA_TYPOGRAPHY,
    radius: PREVIA_RADIUS,
    touchTarget: PREVIA_TOUCH_TARGET,
  };
}
