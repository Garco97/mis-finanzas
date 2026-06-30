import { getAccessToken, getCurrentUser, getSheetIdKey, refreshAccessToken } from './google-auth.js';

const SHEET_NAME = 'Movimientos';

async function apiRequest(url, options = {}, retry = true) {
  const token = getAccessToken();
  if (!token) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401 && retry) {
    await refreshAccessToken();
    return apiRequest(url, options, false);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error?.error?.message || `Error de Google Sheets (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function rowsToMovements(rows) {
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      id: String(row[0]),
      type: String(row[1]),
      amount: Number(row[2]),
      note: String(row[3] || ''),
      date: String(row[4]),
    }));
}

function movementsToRows(items) {
  return [
    ['id', 'type', 'amount', 'note', 'date'],
    ...items.map((item) => [
      item.id,
      item.type,
      item.amount,
      item.note || '',
      item.date,
    ]),
  ];
}

export async function ensureSpreadsheet() {
  const user = getCurrentUser();
  if (!user?.sub) throw new Error('Usuario no autenticado');

  const storageKey = getSheetIdKey(user.sub);
  const existingId = localStorage.getItem(storageKey);
  if (existingId) return existingId;

  const created = await apiRequest('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'Mis Finanzas' },
      sheets: [{ properties: { title: SHEET_NAME } }],
    }),
  });

  localStorage.setItem(storageKey, created.spreadsheetId);

  await apiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [{
          range: `${SHEET_NAME}!A1`,
          majorDimension: 'ROWS',
          values: [['id', 'type', 'amount', 'note', 'date']],
        }],
      }),
    }
  );

  return created.spreadsheetId;
}

export async function loadMovementsFromSheet() {
  const spreadsheetId = await ensureSpreadsheet();
  const range = encodeURIComponent(`${SHEET_NAME}!A2:E`);
  const data = await apiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
  );
  return rowsToMovements(data.values || []);
}

export async function saveMovementsToSheet(items) {
  const spreadsheetId = await ensureSpreadsheet();
  const values = movementsToRows(items);

  await apiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [{
          range: `${SHEET_NAME}!A1`,
          majorDimension: 'ROWS',
          values,
        }],
      }),
    }
  );
}
