// Obtén tu Client ID en https://console.cloud.google.com
// APIs y servicios → Credenciales → ID de cliente OAuth (Aplicación web)

export const GOOGLE_CLIENT_ID = 'TU_CLIENT_ID.apps.googleusercontent.com';

export function isGoogleConfigured() {
  return Boolean(
    GOOGLE_CLIENT_ID &&
    GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com') &&
    !GOOGLE_CLIENT_ID.startsWith('TU_')
  );
}
