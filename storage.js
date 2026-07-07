import { isGoogleConfigured } from './google-config.js';
import {
  initGoogleAuth,
  handleOAuthRedirect,
  restoreSession,
  ensureValidToken,
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

let syncing = false;
const syncListeners = new Set();

function setSyncing(value) {
  if (syncing === value) return;
  syncing = value;
  syncListeners.forEach((cb) => {
    try {
      cb(value);
    } catch {
      // no romper el resto de listeners
    }
  });
}

export function isSyncing() {
  return syncing;
}

export function subscribeSync(callback) {
  syncListeners.add(callback);
  callback(syncing);
  return () => syncListeners.delete(callback);
}

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

export async function handleOAuthCallback() {
  return handleOAuthRedirect();
}

export async function refreshFromCloud() {
  if (!isGoogleConfigured() || !getCurrentUser()) {
    return { ok: false };
  }

  // No leer de la nube mientras se está guardando: evitaría pisar el cambio recién hecho
  if (syncing) {
    return { ok: false, skipped: true };
  }

  setSyncing(true);
  try {
    movementsCache = await loadMovementsFromSheet();
    writeLocal(movementsCache);
    syncMode = 'sheets';
    lastSyncError = null;
    return { ok: true, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    return { ok: false, error: error.message };
  } finally {
    setSyncing(false);
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

  await ensureValidToken();

  try {
    const remoteItems = await loadMovementsFromSheet();
    const localItems = readLocal();
    const merged = mergeMovements(localItems, remoteItems);

    movementsCache = merged;
    writeLocal(merged);
    syncMode = 'sheets';
    lastSyncError = null;

    // Si había cambios locales sin subir (p. ej. la app se cerró antes de sincronizar), súbelos
    if (merged.length !== remoteItems.length) {
      syncRemote();
    }

    return { authenticated: true, user, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    movementsCache = readLocal();
    syncMode = 'local';
    return { authenticated: true, user, mode: 'local', error: error.message };
  }
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

// Guarda al instante en local/caché y actualiza la UI sin esperar a la red.
export function applyMovements(items) {
  movementsCache = items;
  writeLocal(items);
}

// Sincroniza la caché actual con Google Sheets en segundo plano.
export async function syncRemote() {
  if (!isGoogleConfigured() || !getCurrentUser()) {
    syncMode = 'local';
    return { ok: true, mode: 'local' };
  }

  setSyncing(true);
  try {
    await saveMovementsToSheet(movementsCache);
    syncMode = 'sheets';
    lastSyncError = null;
    return { ok: true, mode: 'sheets' };
  } catch (error) {
    lastSyncError = error.message;
    syncMode = 'local';
    return { ok: false, mode: 'local', error: error.message };
  } finally {
    setSyncing(false);
  }
}

// Compatibilidad: guarda local y sincroniza (esperando el resultado).
export async function saveMovements(items) {
  applyMovements(items);
  return syncRemote();
}

export function clearAfterSignOut() {
  movementsCache = [];
  syncMode = 'local';
  lastSyncError = null;
}
