import { GOOGLE_CLIENT_ID } from './google-config.js';

const SESSION_KEY = 'mis-finanzas-session';
const REFRESH_TOKEN_KEY = 'mis-finanzas-refresh';
const PKCE_VERIFIER_KEY = 'mis-finanzas-pkce';
const SHEET_ID_PREFIX = 'mis-finanzas-sheet-';

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
  const url = new URL(location.href);
  url.search = '';
  history.replaceState({}, '', url.pathname + url.hash);
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
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
  if (useRedirectFlow()) return;

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

async function exchangeCodeForTokens(code, verifier) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Error al obtener token');
  }

  return payload;
}

async function refreshWithStoredToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
  }

  const session = loadSession();
  if (!session?.user) return null;

  saveSession(payload.access_token, session.user, payload.expires_in || 3600);
  return payload.access_token;
}

async function startRedirectSignIn() {
  const verifier = randomVerifier();
  const challenge = await sha256Base64Url(verifier);
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });

  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export async function handleOAuthRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');

  if (!code && !error) return null;

  clearOAuthUrl();

  if (error) {
    throw new Error(error);
  }

  const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
  localStorage.removeItem(PKCE_VERIFIER_KEY);

  if (!verifier) {
    throw new Error('Sesión de login expirada. Vuelve a intentarlo.');
  }

  const tokens = await exchangeCodeForTokens(code, verifier);
  const user = await fetchUserInfo(tokens.access_token);

  saveSession(tokens.access_token, user, tokens.expires_in || 3600);

  if (tokens.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }

  return user;
}

export async function signInWithGoogle() {
  if (useRedirectFlow()) {
    await startRedirectSignIn();
    return null;
  }

  const token = await requestAccessToken('consent');
  const user = await fetchUserInfo(token);
  saveSession(token, user);
  return user;
}

export async function refreshAccessToken() {
  const refreshed = await refreshWithStoredToken();
  if (refreshed) return refreshed;

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
    const refreshed = await refreshWithStoredToken();
    if (refreshed) {
      try {
        await fetchUserInfo(refreshed);
        return loadSession()?.user || null;
      } catch {
        // fall through
      }
    }

    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function signOut() {
  const session = loadSession();

  if (session?.token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(session.token, () => {});
  }

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(PKCE_VERIFIER_KEY);
}

export function formatAuthError(error) {
  const message = error?.message || 'No se pudo iniciar sesión';

  if (message.includes('popup_closed') || message.includes('popup_failed_to_open')) {
    return 'No se pudo abrir Google. Prueba de nuevo o usa Safari/Chrome actualizado.';
  }

  if (message.includes('access_denied')) {
    return 'Has cancelado el acceso.';
  }

  if (message.includes('redirect_uri_mismatch')) {
    return `URI de redirección incorrecta. Añade ${getRedirectUri()} en Google Cloud.`;
  }

  return message;
}
