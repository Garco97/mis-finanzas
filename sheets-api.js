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

function clearCachedSpreadsheetId(storageKey) {
  localStorage.removeItem(storageKey);
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

async function findSpreadsheetInDrive(preferredId = null) {
  try {
    const query = encodeURIComponent(
      `name = '${SPREADSHEET_TITLE}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`
    );

    const data = await apiRequest(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=20`
    );

    const files = data.files || [];
    if (files.length === 0) return null;
    if (files.length === 1) return files[0].id;

    // Si la hoja que ya usábamos sigue existiendo, mantenerla (evita saltar entre duplicados)
    if (preferredId && files.some((file) => file.id === preferredId)) {
      return preferredId;
    }

    // Con duplicados, elegir de forma estable: más movimientos y, a igualdad, la más antigua
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
  } catch {
    // Drive API no disponible o sin permiso: no bloquear la creación de una hoja nueva
    return null;
  }
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

async function resolveSpreadsheetId({ createIfMissing }) {
  const user = getCurrentUser();
  if (!user?.sub) throw new Error('Usuario no autenticado');

  const storageKey = getSheetIdKey(user.sub);
  const cachedId = localStorage.getItem(storageKey);

  // 1. Caché primero: si la hoja que ya usábamos sigue accesible, no cambiar nunca de hoja
  if (cachedId && await isSpreadsheetAccessible(cachedId)) {
    return cachedId;
  }

  if (cachedId) {
    clearCachedSpreadsheetId(storageKey);
  }

  // 2. Buscar en Drive (sincroniza móvil/PC); si existe la anterior, mantenerla
  const driveId = await findSpreadsheetInDrive(cachedId);
  if (driveId) {
    cacheSpreadsheetId(storageKey, driveId);
    return driveId;
  }

  // 3. Solo crear una hoja nueva si de verdad no hay ninguna
  if (!createIfMissing) return null;

  return createSpreadsheet(storageKey);
}

export async function ensureSpreadsheet() {
  return resolveSpreadsheetId({ createIfMissing: true });
}

export async function loadMovementsFromSheet() {
  const spreadsheetId = await resolveSpreadsheetId({ createIfMissing: false });
  if (!spreadsheetId) return [];
  return loadMovementsFromSpreadsheetId(spreadsheetId);
}

export async function saveMovementsToSheet(items, retried = false) {
  const spreadsheetId = await ensureSpreadsheet();
  const values = movementsToRows(items);
  const dataRange = encodeURIComponent(`${SHEET_NAME}!A2:E`);

  try {
    await apiRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${dataRange}:clear`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  } catch (error) {
    const message = String(error.message);
    if (!retried && (message.includes('404') || message.includes('not found'))) {
      const user = getCurrentUser();
      if (user?.sub) clearCachedSpreadsheetId(getSheetIdKey(user.sub));
      return saveMovementsToSheet(items, true);
    }
    throw error;
  }

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
