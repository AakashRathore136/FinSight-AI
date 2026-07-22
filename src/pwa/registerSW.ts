export interface BeforeInstallPromptEvent extends Event {
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
      console.log('Service Worker registered:', registration.scope);

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
