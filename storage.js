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

  try {
    movementsCache = await loadMovementsFromSheet();
    writeLocal(movementsCache);
    syncMode = 'sheets';
    lastSyncError = null;
    return { authenticated: true, user, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    movementsCache = readLocal();
    syncMode = 'local';
    return { authenticated: true, user, mode: 'local', error: error.message };
  }
}

export async function completeSignIn() {
  const user = await signInWithGoogle();

  try {
    const localItems = readLocal();
    const remoteItems = await loadMovementsFromSheet();

    if (remoteItems.length === 0 && localItems.length > 0) {
      movementsCache = localItems;
      await saveMovementsToSheet(localItems);
    } else {
      movementsCache = remoteItems;
      writeLocal(remoteItems);
    }

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

  if (!isGoogleConfigured() || !getCurrentUser()) {
    writeLocal(items);
    syncMode = 'local';
    return;
  }

  await saveMovementsToSheet(items);
  writeLocal(items);
  syncMode = 'sheets';
  lastSyncError = null;
}

export function clearAfterSignOut() {
  movementsCache = [];
  syncMode = 'local';
  lastSyncError = null;
}
