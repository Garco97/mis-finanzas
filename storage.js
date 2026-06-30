import { isGoogleConfigured } from './google-config.js';
import {
  initGoogleAuth,
  restoreSession,
  signInWithGoogle,
  signOut,
  getCurrentUser,
  formatAuthError,
} from './google-auth.js';
import { loadMovementsFromSheet, saveMovementsToSheet } from './sheets-api.js';

const LOCAL_KEY_PREFIX = 'mis-finanzas-movimientos';

let movementsCache = [];
let syncMode = 'local';
let lastSyncError = null;

function getLocalKey() {
  const user = getCurrentUser();
  return user?.sub ? `${LOCAL_KEY_PREFIX}-${user.sub}` : LOCAL_KEY_PREFIX;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(getLocalKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(getLocalKey(), JSON.stringify(items));
}

function mergeMovements(localItems, remoteItems) {
  const byId = new Map();

  for (const item of remoteItems) {
    byId.set(item.id, item);
  }

  for (const item of localItems) {
    const existing = byId.get(item.id);
    if (!existing || new Date(item.date) > new Date(existing.date)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getMovements() {
  return movementsCache;
}

export function isCloudEnabled() {
  return syncMode === 'sheets';
}

export function getSyncStatus() {
  return { mode: syncMode, error: lastSyncError };
}

export function getUser() {
  return getCurrentUser();
}

export { signInWithGoogle, signOut, formatAuthError, isGoogleConfigured };

export async function initGoogle() {
  await initGoogleAuth();
}

export async function refreshFromCloud() {
  if (!isGoogleConfigured() || !getCurrentUser()) {
    return { ok: false };
  }

  try {
    movementsCache = await loadMovementsFromSheet();
    writeLocal(movementsCache);
    syncMode = 'sheets';
    lastSyncError = null;
    return { ok: true, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    return { ok: false, error: error.message };
  }
}

export async function tryRestoreSession() {
  if (!isGoogleConfigured()) {
    movementsCache = readLocal();
    syncMode = 'local';
    return { authenticated: false, localOnly: true };
  }

  const user = await restoreSession();
  if (!user) {
    movementsCache = [];
    syncMode = 'local';
    return { authenticated: false, localOnly: false };
  }

  const result = await refreshFromCloud();
  if (result.ok) {
    return { authenticated: true, user, mode: 'sheets' };
  }

  lastSyncError = result.error;
  movementsCache = readLocal();
  syncMode = 'local';
  return { authenticated: true, user, mode: 'local', error: result.error };
}

export async function completeSignIn(existingUser = null) {
  const user = existingUser || (await signInWithGoogle());
  if (!user) return null;

  try {
    const localItems = readLocal();
    const remoteItems = await loadMovementsFromSheet();
    const merged = mergeMovements(localItems, remoteItems);

    movementsCache = merged;
    writeLocal(merged);
    await saveMovementsToSheet(merged);

    syncMode = 'sheets';
    lastSyncError = null;
    return { user, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    movementsCache = readLocal();
    syncMode = 'local';
    return { user, mode: 'local', error: error.message };
  }
}

export async function saveMovements(items) {
  movementsCache = items;
  writeLocal(items);

  if (!isGoogleConfigured() || !getCurrentUser()) {
    syncMode = 'local';
    return { ok: true, mode: 'local' };
  }

  try {
    await saveMovementsToSheet(items);
    syncMode = 'sheets';
    lastSyncError = null;
    return { ok: true, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    syncMode = 'local';
    return { ok: false, mode: 'local', error: error.message };
  }
}

export function clearAfterSignOut() {
  movementsCache = [];
  syncMode = 'local';
  lastSyncError = null;
}
