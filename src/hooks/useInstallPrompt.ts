"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState =
  /** Todavía no sabemos: estamos en el servidor o hidratando */
  | "loading"
  /** El navegador ofrece instalarla y tenemos el botón listo */
  | "available"
  /** Ya está instalada y corriendo como app */
  | "installed"
  /** iOS: hay que hacerlo a mano desde el menú Compartir */
  | "ios"
  /** El navegador no soporta instalar aplicaciones web */
  | "unsupported";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari en iOS no implementa display-mode y usa esta propiedad propia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOS;
}

export function useInstallPrompt(): {
  state: InstallState;
  install: () => Promise<boolean>;
} {
  const mounted = useIsMounted();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Sin esto Chrome muestra su propia barrita y nunca nos da el evento.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // El evento es de un solo uso: una vez consumido hay que soltarlo.
    setPromptEvent(null);
    return outcome === "accepted";
  }, [promptEvent]);

  let state: InstallState = "loading";
  if (mounted) {
    if (justInstalled || isStandalone()) state = "installed";
    else if (promptEvent) state = "available";
    else if (isIOS()) state = "ios";
    else state = "unsupported";
  }

  return { state, install };
}
