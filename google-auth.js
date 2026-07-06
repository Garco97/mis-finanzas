import { GOOGLE_CLIENT_ID } from './google-config.js';

const SESSION_KEY = 'mis-finanzas-session';
const GOOGLE_LINKED_KEY = 'mis-finanzas-google-linked';
const SHEET_ID_PREFIX = 'mis-finanzas-sheet-';
const OAUTH_STATE_KEY = 'mis-finanzas-oauth-state';
const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000;

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

let tokenClient = null;
let pendingAuth = null;
let refreshInFlight = null;

function migrateSession(session) {
  if (session.expiresAt && !session.tokenExpiresAt) {
    session.tokenExpiresAt = session.expiresAt;
    session.sessionExpiresAt = session.expiresAt + SESSION_DURATION_MS;
    delete session.expiresAt;
  }
  return session;
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = migrateSession(JSON.parse(raw));

    if (session.sessionExpiresAt && session.sessionExpiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    if (!session.sessionExpiresAt) {
      session.sessionExpiresAt = Date.now() + SESSION_DURATION_MS;
    }

    return session;
  } catch {
    return null;
  }
}

function isTokenValid(session) {
  return Boolean(session?.token && session.tokenExpiresAt > Date.now());
}

function needsTokenRefresh(session) {
  if (!session?.token) return true;
  return session.tokenExpiresAt <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

function saveSession(token, user, expiresInSeconds = 3600) {
  const now = Date.now();
  const existing = loadStoredSession();
  const sameUser = existing?.user?.sub && existing.user.sub === user.sub;

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token,
      user,
      tokenExpiresAt: now + expiresInSeconds * 1000,
      sessionExpiresAt: sameUser && existing.sessionExpiresAt > now
        ? existing.sessionExpiresAt
        : now + SESSION_DURATION_MS,
    })
  );
  localStorage.setItem(GOOGLE_LINKED_KEY, 'true');
}

export function getSession() {
  return loadStoredSession();
}

export function getAccessToken() {
  const session = loadStoredSession();
  if (!isTokenValid(session)) return null;
  return session.token;
}

export function getCurrentUser() {
  return loadStoredSession()?.user || null;
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

function createTokenClient() {
  const session = loadStoredSession();

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    hint: session?.user?.email || undefined,
    callback: (response) => {
      if (!pendingAuth) return;

      if (response.error) {
        pendingAuth.reject(new Error(response.error));
        pendingAuth = null;
        return;
      }

      pendingAuth.resolve({
        access_token: response.access_token,
        expires_in: response.expires_in || 3600,
      });
      pendingAuth = null;
    },
    error_callback: (error) => {
      if (!pendingAuth) return;
      pendingAuth.reject(new Error(error?.type || 'oauth_error'));
      pendingAuth = null;
    },
  });
}

export async function initGoogleAuth() {
  await waitForGoogleIdentity();
  createTokenClient();
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

function startMobileRedirectSignIn(forceConsent = false) {
  const redirectUri = getRedirectUri();
  const state = crypto.randomUUID?.() || String(Date.now());
  const isReturning = localStorage.getItem(GOOGLE_LINKED_KEY) === 'true';

  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state,
  });

  if (forceConsent || !isReturning) {
    params.set('prompt', 'consent');
  } else {
    params.set('prompt', 'none');
  }

  const session = loadStoredSession();
  if (session?.user?.email) {
    params.set('login_hint', session.user.email);
  }

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
    if (error === 'login_required' || error === 'interaction_required') {
      startMobileRedirectSignIn(true);
      return null;
    }
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

  const { access_token, expires_in } = await requestAccessToken('consent');
  const user = await fetchUserInfo(access_token);
  saveSession(access_token, user, expires_in);
  return user;
}

export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    if (!tokenClient) {
      await initGoogleAuth();
    }

    if (!tokenClient) {
      throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
    }

    const session = loadStoredSession();
    if (!session?.user) {
      throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
    }

    createTokenClient();

    const { access_token, expires_in } = await requestAccessToken('');
    saveSession(access_token, session.user, expires_in);
    return access_token;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function ensureValidToken() {
  const session = loadStoredSession();
  if (!session?.user) return false;

  if (!needsTokenRefresh(session)) {
    return isTokenValid(session);
  }

  try {
    await refreshAccessToken();
    return true;
  } catch {
    return isTokenValid(loadStoredSession());
  }
}

export async function restoreSession() {
  const session = loadStoredSession();
  if (!session?.user) return null;

  if (isTokenValid(session)) {
    try {
      await fetchUserInfo(session.token);
      return session.user;
    } catch {
      // El token dejó de ser válido; intentar renovar.
    }
  }

  try {
    await refreshAccessToken();
    return loadStoredSession()?.user || null;
  } catch {
    if (session.sessionExpiresAt > Date.now()) {
      return session.user;
    }

    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function signOut() {
  const session = loadStoredSession();

  if (session?.token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(session.token, () => {});
  }

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(GOOGLE_LINKED_KEY);
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
