const META_CACHE = 'mis-finanzas-meta';
const META_DATE_KEY = '/daily-reminder-date';
const META_ENABLED_KEY = '/notifications-enabled';
const REMINDER_TITLE = 'Mis Finanzas';
const REMINDER_BODY = '¿Has metido ya los gastos del día?';
const REMINDER_TAG = 'mis-finanzas-daily';

let settings = {
  enabled: false,
  reminderHour: 21,
  reminderMinute: 0,
  nextReminderAt: 0,
};

let reminderTimer = null;

function getTodayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function computeNextReminderTimestamp(hour, minute) {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (Date.now() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

async function readMeta(key) {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(key);
  return response ? response.text() : null;
}

async function writeMeta(key, value) {
  const cache = await caches.open(META_CACHE);
  await cache.put(key, new Response(value));
}

async function wasReminderSentToday() {
  const last = await readMeta(META_DATE_KEY);
  return last === getTodayKey();
}

async function markReminderSentToday() {
  await writeMeta(META_DATE_KEY, getTodayKey());
}

async function showDailyReminder() {
  if (!settings.enabled) return;
  if (await wasReminderSentToday()) return;

  await self.registration.showNotification(REMINDER_TITLE, {
    body: REMINDER_BODY,
    tag: REMINDER_TAG,
    renotify: true,
  });
  await markReminderSentToday();
}

function scheduleNextReminder() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }

  if (!settings.enabled) return;

  const now = Date.now();
  let triggerAt = settings.nextReminderAt;

  if (!triggerAt || triggerAt <= now) {
    triggerAt = computeNextReminderTimestamp(
      settings.reminderHour,
      settings.reminderMinute
    );
    settings.nextReminderAt = triggerAt;
  }

  const delay = Math.min(triggerAt - now, 2147483647);
  reminderTimer = setTimeout(async () => {
    await showDailyReminder();
    settings.nextReminderAt = computeNextReminderTimestamp(
      settings.reminderHour,
      settings.reminderMinute
    );
    scheduleNextReminder();
  }, delay);
}

async function loadSettingsFromCache() {
  settings.enabled = (await readMeta(META_ENABLED_KEY)) === 'true';
}

async function applySettings(data) {
  settings.enabled = Boolean(data.enabled);
  settings.reminderHour = data.reminderHour ?? 21;
  settings.reminderMinute = data.reminderMinute ?? 0;
  settings.nextReminderAt = data.nextReminderAt ?? computeNextReminderTimestamp(
    settings.reminderHour,
    settings.reminderMinute
  );

  await writeMeta(
    META_ENABLED_KEY,
    settings.enabled ? 'true' : 'false'
  );

  scheduleNextReminder();
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    loadSettingsFromCache().then(() => {
      scheduleNextReminder();
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'UPDATE_REMINDER') {
    event.waitUntil(applySettings(event.data));
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'daily-expense-reminder') return;

  event.waitUntil(
    loadSettingsFromCache().then(async () => {
      const hour = new Date().getHours();
      if (hour < settings.reminderHour) return;
      await showDailyReminder();
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }

      return undefined;
    })
  );
});
