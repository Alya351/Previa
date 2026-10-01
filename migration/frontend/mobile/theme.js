// ============================================================================
// PREVIA Mobile Design System — Charte Graphique Officielle
// Couleurs extraites directement du logo officiel PREVIA (échantillonnage pixel)
// ============================================================================

export const PREVIA_COLORS = {
  // Palette officielle PREVIA (Extraite pixel par pixel du logo officiel PREVIA)
  bluePrimary: '#009FE3',     // Bleu Ciel PREVIA (logo, CTA, accents principaux)
  blueDeep: '#014791',        // Bleu Marine Nuit PREVIA (dégradés, titres, fond de marque)
  blueMedium: '#2E9DE7',      // Bleu Intermédiaire PREVIA
  navyText: '#152E4C',        // Texte principal foncé
  nearBlack: '#111316',       // Fond sombre de barre et éléments profonds
  redAlert: '#DB2323',        // Rouge Officiel PREVIA (Alertes uniquement)
  bgLight: '#F4F8FB',         // Fond clair épuré officiel PREVIA
  white: '#FFFFFF',
  graySecondary: '#6B7280',   // Texte secondaire / sous-titres

  // Sévérité des alertes
  severityCritical: '#DB2323',
  severityHigh: '#F59E0B',
  severityInfo: '#009FE3',

  // Actions ergonomiques
  actionVerify: '#16A34A',
  actionReject: '#6B7280',
  actionWarning: '#EAB308',

  // Mode sombre officiel
  darkBackground: '#111316',
  darkSurface: '#1A1E24',
  darkSurfaceElevated: '#242932',
  darkBorder: '#2E3540',
  darkTextPrimary: '#FFFFFF',
  darkTextSecondary: '#D1D5DB',
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
