/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from 'react';
import {
  promptInstall,
  dismissInstall,
  applyUpdate,
  getNetworkStatus,
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
} from './registerSW';

export function InstallPrompt() {
  const [showInstall, setShowInstall] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'offline'>(getNetworkStatus());
  const [notificationOptIn, setNotificationOptIn] = useState(false);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'default'>('default');

  useEffect(() => {
    if (isNotificationSupported()) {
      setNotificationSupported(true);
      setNotificationPermission(getNotificationPermission());
    }
  }, []);

  useEffect(() => {
    const handleInstallAvailable = () => setShowInstall(true);
    const handleInstallDismissed = () => setShowInstall(false);
    const handleUpdateAvailable = () => setShowUpdate(true);
    const handleNetworkChange = (event: Event) => {
      setNetworkStatus((event as CustomEvent).detail);
    };

    window.addEventListener('pwaInstallAvailable', handleInstallAvailable);
    window.addEventListener('pwaInstallDismissed', handleInstallDismissed);
    window.addEventListener('swUpdateAvailable', handleUpdateAvailable);
    window.addEventListener('networkStatusChange', handleNetworkChange);

    return () => {
      window.removeEventListener('pwaInstallAvailable', handleInstallAvailable);
      window.removeEventListener('pwaInstallDismissed', handleInstallDismissed);
      window.removeEventListener('swUpdateAvailable', handleUpdateAvailable);
      window.removeEventListener('networkStatusChange', handleNetworkChange);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (notificationOptIn && notificationSupported) {
      await requestNotificationPermission();
    }
    const installed = await promptInstall();
    if (installed) {
      setShowInstall(false);
    }
  }, [notificationOptIn, notificationSupported]);

  const handleDismiss = useCallback(() => {
    dismissInstall();
    setShowInstall(false);
  }, []);

  const handleUpdate = useCallback(() => {
    applyUpdate();
    setShowUpdate(false);
  }, []);

  const handleDismissUpdate = useCallback(() => {
    setShowUpdate(false);
  }, []);

  if (!showInstall && !showUpdate) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      {showInstall && (
        <div className="bg-slate-800 border border-sky-500/30 rounded-lg p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">Install FinSight AI</h3>
              <p className="text-slate-400 text-xs mt-1">
                Install our app for a better experience with offline support
              </p>
              {notificationSupported && notificationPermission === 'default' && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationOptIn}
                    onChange={(e) => setNotificationOptIn(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-slate-300 text-xs">Enable push notifications</span>
                </label>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss install prompt"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {notificationOptIn && notificationSupported ? 'Install and Enable Notifications' : 'Install'}
            </button>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white text-sm font-medium py-2 px-4 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {showUpdate && (
        <div className="bg-slate-800 border border-emerald-500/30 rounded-lg p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">Update Available</h3>
              <p className="text-slate-400 text-xs mt-1">
                A new version of FinSight AI is ready to install
              </p>
            </div>
            <button
              onClick={handleDismissUpdate}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Dismiss update prompt"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleUpdate}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Update Now
            </button>
            <button
              onClick={handleDismissUpdate}
              className="text-slate-400 hover:text-white text-sm font-medium py-2 px-4 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OfflineIndicator() {
  const [status, setStatus] = useState<'online' | 'offline'>(getNetworkStatus());

  useEffect(() => {
    const handleNetworkChange = (event: Event) => {
      setStatus((event as CustomEvent).detail);
    };

    setStatus(getNetworkStatus());
    window.addEventListener('networkStatusChange', handleNetworkChange);
    return () => window.removeEventListener('networkStatusChange', handleNetworkChange);
  }, []);

  if (status === 'online') {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 text-sm font-medium z-50">
      You are currently offline
    </div>
  );
}
