import { GOOGLE_CLIENT_ID } from './google-config.js';

const SESSION_KEY = 'mis-finanzas-session';
const SHEET_ID_PREFIX = 'mis-finanzas-sheet-';
const OAUTH_STATE_KEY = 'mis-finanzas-oauth-state';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

let tokenClient = null;
let pendingAuth = null;

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session.expiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function saveSession(token, user, expiresInSeconds = 55 * 60) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token,
      user,
      expiresAt: Date.now() + expiresInSeconds * 1000,
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

function isMobileDevice() {
  return (
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /MacIntel|Macintosh/.test(navigator.platform))
  );
}

function useRedirectFlow() {
  return isMobileDevice();
}

export function getRedirectUri() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';

  if (url.pathname.endsWith('/index.html')) {
    url.pathname = url.pathname.replace(/index\.html$/, '');
  }

  if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }

  return url.origin + url.pathname;
}

function clearOAuthUrl() {
  history.replaceState({}, '', location.pathname);
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
    scope: SCOPES,
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
    error_callback: (error) => {
      if (!pendingAuth) return;
      pendingAuth.reject(new Error(error?.type || 'oauth_error'));
      pendingAuth = null;
    },
  });
}

function requestAccessToken(prompt = '') {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('Google no está listo. Recarga la página.'));
      return;
    }

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

function startMobileRedirectSignIn() {
  const redirectUri = getRedirectUri();
  const state = crypto.randomUUID?.() || String(Date.now());
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });

  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export async function handleOAuthRedirect() {
  const hash = location.hash?.substring(1);
  if (!hash || !hash.includes('access_token=')) return null;

  const params = new URLSearchParams(hash);
  const error = params.get('error');
  const token = params.get('access_token');
  const state = params.get('state');
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);

  clearOAuthUrl();
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  if (error) {
    throw new Error(error);
  }

  if (savedState && state && savedState !== state) {
    throw new Error('Respuesta de Google no válida. Vuelve a intentarlo.');
  }

  if (!token) return null;

  const expiresIn = Number(params.get('expires_in') || 3600);
  const user = await fetchUserInfo(token);
  saveSession(token, user, expiresIn);
  return user;
}

export async function signInWithGoogle() {
  if (useRedirectFlow()) {
    startMobileRedirectSignIn();
    return null;
  }

  const token = await requestAccessToken('consent');
  const user = await fetchUserInfo(token);
  saveSession(token, user);
  return user;
}

export async function refreshAccessToken() {
  if (!tokenClient) {
    await initGoogleAuth();
  }

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
    try {
      await refreshAccessToken();
      return loadSession()?.user || null;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }
}

export function signOut() {
  const session = loadSession();

  if (session?.token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(session.token, () => {});
  }

  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
}

export function formatAuthError(error) {
  const message = error?.message || 'No se pudo iniciar sesión';

  if (message.includes('popup_closed') || message.includes('popup_failed_to_open')) {
    return 'Se cerró la ventana de Google. Prueba de nuevo.';
  }

  if (message.includes('access_denied')) {
    return 'Has cancelado el acceso.';
  }

  if (message.includes('redirect_uri_mismatch')) {
    return `Añade ${getRedirectUri()} en URIs de redirección de Google Cloud.`;
  }

  if (message.includes('unsupported_response_type')) {
    return 'Google no permite este tipo de login. Abre la app en Safari o Chrome.';
  }

  return message;
}
