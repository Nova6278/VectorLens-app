import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Signal to index.html that we have successfully initialized
  window.dispatchEvent(new Event('vectorlens-ready'));
} catch (e) {
  console.error("Mounting error:", e);
}