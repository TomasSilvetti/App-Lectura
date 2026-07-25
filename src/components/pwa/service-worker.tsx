"use client";

import { useEffect } from "react";

/**
 * Registra el service worker. Además de dejar la app usable sin conexión, es
 * requisito de Chrome para ofrecer la instalación.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("No se pudo registrar el service worker", error);
      });
    };

    // Después de load para no competir con la carga inicial de la página.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
