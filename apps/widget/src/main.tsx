import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// The widget is intended to be self-initializing when the script is included.
(function () {
  const CONTAINER_ID = 'lumina-widget-container';
  
  if (document.getElementById(CONTAINER_ID)) {
    return;
  }

  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  document.body.appendChild(container);

  const shadow = container.attachShadow({ mode: 'open' });
  const root = document.createElement('div');
  root.id = 'lumina-widget-root';
  shadow.appendChild(root);

  // Inject styles into Shadow DOM
  // Since we're in library mode, we might need a way to get the CSS string.
  // For now, let's assume we can inject it or use a script to find it.
  // A better way is to embed the styles in the JS bundle.
  
  const styles = document.createElement('style');
  // In a real build, we'd replace this placeholder with the actual bundled CSS.
  // During dev, we can inject the styles.
  styles.textContent = `
    /* Basic styles to ensure the container is fixed and visible */
    #lumina-widget-root {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    }
  `;
  shadow.appendChild(styles);

  // Attempt to load Tailwind styles if they are available as a global string
  // (This is a simplified approach for this task)
  if ((window as any).LUMINA_WIDGET_CSS) {
    const tailwindStyles = document.createElement('style');
    tailwindStyles.textContent = (window as any).LUMINA_WIDGET_CSS;
    shadow.appendChild(tailwindStyles);
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
})();
