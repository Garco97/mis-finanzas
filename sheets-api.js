import { getAccessToken, getCurrentUser, getSheetIdKey } from './google-auth.js';

const SHEET_NAME = 'Movimientos';

async function sheetsFetch(path, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Sesión no válida');

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || 'Error al acceder a Google Sheets');
  }

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

async function writeSheetValues(spreadsheetId, values) {
  const range = `${SHEET_NAME}!A1:E`;
  const token = getAccessToken();

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || 'No se pudo guardar en la hoja');
  }
}

export async function ensureSpreadsheet() {
  const user = getCurrentUser();
  if (!user?.sub) throw new Error('Usuario no autenticado');

  const storageKey = getSheetIdKey(user.sub);
  const existingId = localStorage.getItem(storageKey);
  if (existingId) return existingId;

  const created = await sheetsFetch('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: 'Mis Finanzas' },
      sheets: [{ properties: { title: SHEET_NAME } }],
    }),
  });

  localStorage.setItem(storageKey, created.spreadsheetId);
  await writeSheetValues(created.spreadsheetId, [['id', 'type', 'amount', 'note', 'date']]);
  return created.spreadsheetId;
}

export async function loadMovementsFromSheet() {
  const spreadsheetId = await ensureSpreadsheet();
  const range = `${SHEET_NAME}!A2:E`;
  const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  return rowsToMovements(data.values || []);
}

export async function saveMovementsToSheet(items) {
  const spreadsheetId = await ensureSpreadsheet();
  await writeSheetValues(spreadsheetId, movementsToRows(items));
}
