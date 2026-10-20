import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/Common/ErrorBoundary';
import './index.css';

// Auto-purge stale Service Worker caches and CacheStorage if version updated
const CURRENT_APP_VERSION = '2.0.0';
try {
  const storedVer = localStorage.getItem('arka_app_version');
  if (storedVer !== CURRENT_APP_VERSION) {
    localStorage.setItem('arka_app_version', CURRENT_APP_VERSION);

    // Unregister all old service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      });
    }

    // Purge window.caches
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key).catch(() => {});
        }
      });
    }
  }
} catch {
  // ignore storage errors
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
