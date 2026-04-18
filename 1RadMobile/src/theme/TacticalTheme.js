// 1Rad Tactical HUD: Mobile Design System
// Optimized for React Native

export const COLORS = {
  // Midnight Foundation
  bgMain: '#0b1120',
  bgCard: 'rgba(15, 23, 42, 0.85)',
  bgSidebar: '#0a0f1d',
  
  // HUD Accents (Glow)
  cyan: '#00f2fe',
  indigo: '#6366f1',
  gold: '#fbbf24',
  
  // Tactical Grayscale
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.65)',
  textInverse: '#212529',
  border: 'rgba(255, 255, 255, 0.1)',
  
  // Alert States
  error: '#dc3545',
  success: '#28a745',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
};

export const SHADOWS = {
  cyan: {
    shadowColor: COLORS.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  indigo: {
    shadowColor: COLORS.indigo,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  glass: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  }
};
