// Pega aquí la URL de tu Apps Script (Implementar → Aplicación web → URL que termina en /exec)

export const SHEETS_WEB_APP_URL = '';

export function isSheetsConfigured() {
  return Boolean(
    SHEETS_WEB_APP_URL &&
    SHEETS_WEB_APP_URL.startsWith('https://script.google.com')
  );
}
