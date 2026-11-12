// Single source for the API address (gap analysis P0-6).
//
// The app used to hard-code the old Azure App Service host, which no longer serves
// 1Rad. Set EXPO_PUBLIC_API_URL per build profile in eas.json (Expo inlines
// EXPO_PUBLIC_* variables at build time); the fallback is the production API, the
// same URL as 1RADWeb/.env.production.
export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL || 'https://1rad-api.nexeagle.com/api/v1').replace(/\/+$/, '');
