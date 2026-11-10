import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline app shell + installability. Skipped in dev so edits show up immediately,
// and inside the native shell (Capacitor serves files locally already).
if ("serviceWorker" in navigator && import.meta.env.PROD && !("Capacitor" in window)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* not fatal: the app still works online */
    });
  });
}
