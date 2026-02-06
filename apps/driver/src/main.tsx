import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Register service worker with auto-update
registerSW({
  onNeedRefresh() {
    // Show update prompt to user if needed
    if (confirm('Nouvelle version disponible. Mettre à jour?')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('App ready for offline use');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
