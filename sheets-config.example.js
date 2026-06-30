// Copia este archivo como sheets-config.js y pega tu URL de Apps Script (termina en /exec)

export const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/TU_ID/exec';

export function isSheetsConfigured() {
  return Boolean(
    SHEETS_WEB_APP_URL &&
    SHEETS_WEB_APP_URL.startsWith('https://script.google.com') &&
    !SHEETS_WEB_APP_URL.includes('TU_ID')
  );
}
