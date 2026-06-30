import { getAccessToken, getCurrentUser, getSheetIdKey, refreshAccessToken } from './google-auth.js';

const SHEET_NAME = 'Movimientos';
const SPREADSHEET_TITLE = 'Mis Finanzas';

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
    const message = error?.error?.message || `Error de Google (${response.status})`;
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

function cacheSpreadsheetId(storageKey, spreadsheetId) {
  localStorage.setItem(storageKey, spreadsheetId);
}

async function isSpreadsheetAccessible(spreadsheetId) {
  try {
    await apiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId`
    );
    return true;
  } catch {
    return false;
  }
}

async function loadMovementsFromSpreadsheetId(spreadsheetId) {
  const range = encodeURIComponent(`${SHEET_NAME}!A2:E`);
  const data = await apiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`
  );
  return rowsToMovements(data.values || []);
}

async function findSpreadsheetInDrive() {
  const query = encodeURIComponent(
    `name = '${SPREADSHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
  );

  const data = await apiRequest(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=20`
  );

  const files = data.files || [];
  if (files.length === 0) return null;
  if (files.length === 1) return files[0].id;

  let bestId = files[0].id;
  let bestCount = -1;

  for (const file of files) {
    try {
      const movements = await loadMovementsFromSpreadsheetId(file.id);
      if (movements.length > bestCount) {
        bestCount = movements.length;
        bestId = file.id;
      }
    } catch {
      // ignorar hojas inaccesibles
    }
  }

  return bestId;
}

async function createSpreadsheet(storageKey) {
  const created = await apiRequest('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: SPREADSHEET_TITLE },
      sheets: [{ properties: { title: SHEET_NAME } }],
    }),
  });

  cacheSpreadsheetId(storageKey, created.spreadsheetId);

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

export async function ensureSpreadsheet() {
  const user = getCurrentUser();
  if (!user?.sub) throw new Error('Usuario no autenticado');

  const storageKey = getSheetIdKey(user.sub);
  const cachedId = localStorage.getItem(storageKey);

  if (cachedId && await isSpreadsheetAccessible(cachedId)) {
    return cachedId;
  }

  if (cachedId) {
    localStorage.removeItem(storageKey);
  }

  const existingId = await findSpreadsheetInDrive();
  if (existingId) {
    cacheSpreadsheetId(storageKey, existingId);
    return existingId;
  }

  return createSpreadsheet(storageKey);
}

export async function loadMovementsFromSheet() {
  const spreadsheetId = await ensureSpreadsheet();
  return loadMovementsFromSpreadsheetId(spreadsheetId);
}

export async function saveMovementsToSheet(items) {
  const spreadsheetId = await ensureSpreadsheet();
  const values = movementsToRows(items);
  const dataRange = encodeURIComponent(`${SHEET_NAME}!A2:E`);

  // batchUpdate no borra filas sobrantes; limpiar datos antes de reescribir
  await apiRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${dataRange}:clear`,
    { method: 'POST', body: JSON.stringify({}) }
  );

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
