import { isSheetsConfigured, SHEETS_WEB_APP_URL } from './sheets-config.js';

const LOCAL_KEY = 'mis-finanzas-movimientos';

let movementsCache = [];
let syncMode = 'local';
let lastSyncError = null;

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

async function fetchFromSheets() {
  const response = await fetch(`${SHEETS_WEB_APP_URL}?action=get`);

  if (!response.ok) {
    throw new Error('No se pudo leer la hoja');
  }

  const data = await response.json();
  return data.items || [];
}

async function saveToSheets(items) {
  const response = await fetch(SHEETS_WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'save', items }),
    headers: { 'Content-Type': 'text/plain' },
  });

  if (!response.ok) {
    throw new Error('No se pudo guardar en la hoja');
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
}

export function getMovements() {
  return movementsCache;
}

export async function saveMovements(items) {
  movementsCache = items;
  writeLocal(items);

  if (!isSheetsConfigured()) {
    return;
  }

  await saveToSheets(items);
  syncMode = 'sheets';
  lastSyncError = null;
}

export function isCloudEnabled() {
  return syncMode === 'sheets';
}

export function getSyncStatus() {
  return { mode: syncMode, error: lastSyncError };
}

export async function init() {
  movementsCache = readLocal();
  syncMode = 'local';
  lastSyncError = null;

  if (!isSheetsConfigured()) {
    return { mode: 'local' };
  }

  try {
    const remoteItems = await fetchFromSheets();
    const localItems = readLocal();

    if (remoteItems.length === 0 && localItems.length > 0) {
      movementsCache = localItems;
      await saveToSheets(localItems);
    } else {
      movementsCache = remoteItems;
      writeLocal(remoteItems);
    }

    syncMode = 'sheets';
    return { mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    syncMode = 'local';
    return { mode: 'local', error: error.message };
  }
}
