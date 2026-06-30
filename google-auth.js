import { GOOGLE_CLIENT_ID } from './google-config.js';

const SESSION_KEY = 'mis-finanzas-session';
const SHEET_ID_PREFIX = 'mis-finanzas-sheet-';

let tokenClient = null;
let pendingAuth = null;

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token,
      user,
      expiresAt: Date.now() + 55 * 60 * 1000,
    })
  );
}

export function getSession() {
  return loadSession();
}

export function getAccessToken() {
  return loadSession()?.token || null;
}

export function getCurrentUser() {
  return loadSession()?.user || null;
}

export function getSheetIdKey(userId) {
  return `${SHEET_ID_PREFIX}${userId}`;
}

function waitForGoogleIdentity() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

export async function initGoogleAuth() {
  await waitForGoogleIdentity();

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'openid',
      'email',
      'profile',
    ].join(' '),
    callback: (response) => {
      if (!pendingAuth) return;

      if (response.error) {
        pendingAuth.reject(new Error(response.error));
        pendingAuth = null;
        return;
      }

      pendingAuth.resolve(response.access_token);
      pendingAuth = null;
    },
  });
}

function requestAccessToken(prompt = '') {
  return new Promise((resolve, reject) => {
    pendingAuth = { resolve, reject };
    tokenClient.requestAccessToken({ prompt });
  });
}

async function fetchUserInfo(token) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener tu perfil de Google');
  }

  return response.json();
}

export async function signInWithGoogle() {
  const token = await requestAccessToken('consent');
  const user = await fetchUserInfo(token);
  saveSession(token, user);
  return user;
}

export async function refreshAccessToken() {
  if (!tokenClient) {
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
  }

  const session = loadSession();
  if (!session?.user) {
    throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
  }

  const token = await requestAccessToken('');
  saveSession(token, session.user);
  return token;
}

export async function restoreSession() {
  const session = loadSession();
  if (!session) return null;

  try {
    await fetchUserInfo(session.token);
    return session.user;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function signOut() {
  const session = loadSession();

  if (session?.token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(session.token, () => {});
  }

  sessionStorage.removeItem(SESSION_KEY);
}

export function formatAuthError(error) {
  const message = error?.message || 'No se pudo iniciar sesión';

  if (message.includes('popup_closed')) {
    return 'Se cerró la ventana de Google.';
  }

  if (message.includes('access_denied')) {
    return 'Has cancelado el acceso.';
  }

  return message;
}
