export interface BeforeInstallPromptEvent extends Event {

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let isUpdateAvailable = false;
let newWorker: ServiceWorker | null = null;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return;
  }

  const swUrl = '/sw.js';

  navigator.serviceWorker.register(swUrl)
    .then(registration => {
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              isUpdateAvailable = true;
              newWorker = installingWorker;
              window.dispatchEvent(new CustomEvent('swUpdateAvailable'));
            }
          }
        });
      });

      checkForUpdates(registration);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (newWorker) {
      window.location.reload();
    }
  });

  window.addEventListener('online', () => {
    window.dispatchEvent(new CustomEvent('networkStatusChange', { detail: 'online' }));
  });

  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('networkStatusChange', { detail: 'offline' }));
  });

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('pwaInstallAvailable'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwaInstallDismissed'));
  });
}

export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    return registration.unregister();
  }
  return false;
}

export async function purgeApiCaches(): Promise<void> {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key.startsWith('api-')).map(key => caches.delete(key)),
      );
    } catch {
      // Ignore cache purge failures; the service worker path below is the fallback.
    }
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.active) {
    registration.active.postMessage({ type: 'CLEAR_API_CACHE' });
  }
}

export async function checkForUpdates(registration?: ServiceWorkerRegistration): Promise<boolean> {
  if (!registration) {
    registration = await navigator.serviceWorker.getRegistration();
  }

  if (!registration) {
    return false;
  }

  await registration.update();
  return true;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;

    if (result.outcome === 'dismissed') {
      deferredPrompt = null;
      return false;
    }

    deferredPrompt = null;
    return true;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  deferredPrompt = null;
}

export function isInstallable(): boolean {
  return deferredPrompt !== null;
}

export function isUpdateReady(): boolean {
  return isUpdateAvailable;
}

export function applyUpdate(): void {
  if (!newWorker) return;
  isUpdateAvailable = false;
  newWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function getNetworkStatus(): 'online' | 'offline' {
  return navigator.onLine ? 'online' : 'offline';
}

export function isNotificationSupported(): boolean {
  return 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  return await Notification.requestPermission();
}
