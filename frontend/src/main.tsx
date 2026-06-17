import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";

// Global error handler to suppress harmless Niivue resize errors
window.addEventListener('error', (event) => {
  if (event.message?.includes("Cannot use 'in' operator to search for 'width'") ||
      event.filename?.includes('niivue')) {
    event.preventDefault();
    console.log('[Suppressed] Harmless Niivue canvas error');
    return true;
  }
});

createRoot(document.getElementById("root")!).render(<App />);