const NOTIFICATIONS_KEY = 'mis-finanzas-notifications-enabled';
const PROMPT_SNOOZE_KEY = 'mis-finanzas-notif-prompt-snooze';
const PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const PROMPT_SNOOZE_DENIED_MS = 7 * 24 * 60 * 60 * 1000;
const REMINDER_HOUR = 21;
const REMINDER_MINUTE = 0;
const REMINDER_TITLE = 'Mis Finanzas';
const REMINDER_BODY = '¿Has metido ya los gastos del día?';
const REMINDER_TAG = 'mis-finanzas-daily';
const META_CACHE = 'mis-finanzas-meta';
const META_DATE_KEY = '/daily-reminder-date';
const META_ENABLED_KEY = '/notifications-enabled';

let serviceWorkerRegistration = null;

function getTodayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getNextReminderTimestamp(
  hour = REMINDER_HOUR,
  minute = REMINDER_MINUTE
) {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (Date.now() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

export function isNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATIONS_KEY) === 'true';
}

export function setNotificationsEnabled(enabled) {
  localStorage.setItem(NOTIFICATIONS_KEY, enabled ? 'true' : 'false');
}

export function isSupported() {
  return 'Notification' in window;
}

async function readMeta(key) {
  if (!('caches' in window)) return null;
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(key);
  return response ? response.text() : null;
}

async function writeMeta(key, value) {
  if (!('caches' in window)) return;
  const cache = await caches.open(META_CACHE);
  await cache.put(key, new Response(value));
}

async function postToServiceWorker(message) {
  const registration = await registerServiceWorker();
  if (!registration) return;

  const worker = registration.active || registration.waiting;
  if (worker) {
    worker.postMessage(message);
    return;
  }

  await new Promise((resolve) => {
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });

  registration.active?.postMessage(message);
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (serviceWorkerRegistration) return serviceWorkerRegistration;

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js', {
      scope: './',
    });
    return serviceWorkerRegistration;
  } catch {
    return null;
  }
}

export async function requestPermission() {
  if (!isSupported()) {
    throw new Error('Tu navegador no soporta notificaciones.');
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    throw new Error('Notificaciones bloqueadas. Actívalas en ajustes del navegador.');
  }

  return Notification.requestPermission();
}

async function syncReminderSettings() {
  await writeMeta(META_ENABLED_KEY, isNotificationsEnabled() ? 'true' : 'false');

  await postToServiceWorker({
    type: 'UPDATE_REMINDER',
    enabled: isNotificationsEnabled(),
    reminderHour: REMINDER_HOUR,
    reminderMinute: REMINDER_MINUTE,
    nextReminderAt: getNextReminderTimestamp(),
  });
}

export async function scheduleDailyReminder() {
  if (!isNotificationsEnabled() || Notification.permission !== 'granted') return;

  const registration = await registerServiceWorker();
  if (!registration) return;

  await syncReminderSettings();

  if ('periodicSync' in registration) {
    try {
      await registration.periodicSync.register('daily-expense-reminder', {
        minInterval: 24 * 60 * 60 * 1000,
      });
    } catch {
      // Solo en PWA instalada y con permiso extra en algunos navegadores
    }
  }
}

export async function disableDailyReminder() {
  await writeMeta(META_ENABLED_KEY, 'false');
  await postToServiceWorker({ type: 'UPDATE_REMINDER', enabled: false });
}

export async function enableNotifications() {
  const permission = await requestPermission();
  if (permission !== 'granted') {
    throw new Error('No se concedió permiso para notificaciones.');
  }

  await registerServiceWorker();
  setNotificationsEnabled(true);
  localStorage.removeItem(PROMPT_SNOOZE_KEY);
  await scheduleDailyReminder();
  return permission;
}

async function displayNotification(title, options) {
  const registration = await registerServiceWorker();

  if (registration) {
    await registration.showNotification(title, options);
    return;
  }

  new Notification(title, options);
}

async function markReminderSentToday() {
  const todayKey = getTodayKey();
  await writeMeta(META_DATE_KEY, todayKey);
}

async function wasReminderSentToday() {
  const last = await readMeta(META_DATE_KEY);
  return last === getTodayKey();
}

export async function checkDailyReminder() {
  if (!isNotificationsEnabled()) return;
  if (Notification.permission !== 'granted') return;

  const now = new Date();
  if (now.getHours() < REMINDER_HOUR) return;
  if (await wasReminderSentToday()) return;

  await displayNotification(REMINDER_TITLE, {
    body: REMINDER_BODY,
    tag: REMINDER_TAG,
    renotify: true,
  });
  await markReminderSentToday();
}

export function shouldShowPermissionPrompt() {
  if (!isSupported()) return false;
  if (isNotificationsEnabled() && Notification.permission === 'granted') return false;

  const snoozeUntil = Number(localStorage.getItem(PROMPT_SNOOZE_KEY) || 0);
  return Date.now() >= snoozeUntil;
}

export function snoozePermissionPrompt() {
  const duration = Notification.permission === 'denied'
    ? PROMPT_SNOOZE_DENIED_MS
    : PROMPT_SNOOZE_MS;
  localStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now() + duration));
}

export function getPromptMessage() {
  if (Notification.permission === 'denied') {
    return 'Las notificaciones están bloqueadas. Actívalas en los ajustes del móvil para recibir el aviso diario a las 21:00.';
  }

  if (Notification.permission === 'granted') {
    return 'Activa el aviso diario a las 21:00 para recordarte apuntar tus gastos.';
  }

  return '¿Quieres recibir un aviso cada día a las 21:00 para apuntar tus gastos?';
}

export function canRequestPermissionViaPrompt() {
  return Notification.permission !== 'denied';
}

export function getPermissionStatus() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission;
}

export function getStatusMessage() {
  const status = getPermissionStatus();

  if (status === 'unsupported') {
    return 'No disponible en este navegador.';
  }

  if (status === 'denied') {
    return 'Bloqueadas. Actívalas en los ajustes del sistema o del navegador.';
  }

  if (status === 'granted' && isNotificationsEnabled()) {
    return `Activadas. Aviso diario a las ${REMINDER_HOUR}:00 para recordarte los gastos.`;
  }

  if (status === 'granted') {
    return 'Activa el interruptor para recibir el aviso diario a las 21:00.';
  }

  return 'Te preguntaremos de vez en cuando si quieres activarlas.';
}
