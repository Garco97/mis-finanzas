const NOTIFICATIONS_KEY = 'mis-finanzas-notifications-enabled';

export function isNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATIONS_KEY) === 'true';
}

export function setNotificationsEnabled(enabled) {
  localStorage.setItem(NOTIFICATIONS_KEY, enabled ? 'true' : 'false');
}

export function isSupported() {
  return 'Notification' in window;
}

let serviceWorkerRegistration = null;

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

export async function enableNotifications() {
  const permission = await requestPermission();
  if (permission !== 'granted') {
    throw new Error('No se concedió permiso para notificaciones.');
  }

  await registerServiceWorker();
  setNotificationsEnabled(true);
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

export async function sendTestNotification() {
  await enableNotifications();

  await displayNotification('Mis Finanzas', {
    body: '¡Notificación de prueba! Todo funciona correctamente.',
    tag: 'mis-finanzas-test',
    renotify: true,
  });
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
    return 'Activadas. Te avisaremos de vez en cuando.';
  }

  if (status === 'granted') {
    return 'Permiso concedido. Activa el interruptor para recibir avisos.';
  }

  return 'Pulsa el botón de prueba para activarlas.';
}
