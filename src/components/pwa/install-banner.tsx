"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IosSteps } from "@/components/pwa/install-app";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { useIsMounted } from "@/hooks/useIsMounted";

const DISMISSED_KEY = "lectura:install-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Invitación a instalar, arriba de la biblioteca. Se puede cerrar y no vuelve:
 * la opción queda igual en Ajustes.
 */
export function InstallBanner() {
  const mounted = useIsMounted();
  const { state, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  const hidden =
    !mounted ||
    dismissed ||
    readDismissed() ||
    state === "loading" ||
    state === "installed" ||
    state === "unsupported";

  if (hidden) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // sin localStorage el banner reaparece, que no es grave
    }
  };

  return (
    <div className="relative mb-4 rounded-xl border bg-card p-4 pr-11">
      <Button
        variant="ghost"
        size="icon"
        aria-label="No mostrar más"
        className="absolute top-2 right-2 size-8"
        onClick={close}
      >
        <X className="size-4" />
      </Button>

      <h2 className="font-heading font-semibold">Tenela a mano</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Instalala y te queda como una app en la pantalla de inicio, sin tener
        que buscar la dirección cada vez.
      </p>

      <div className="mt-3">
        {state === "available" ? (
          <Button
            onClick={async () => {
              const accepted = await install();
              if (accepted) {
                toast.success("Lectura se instaló en tu dispositivo");
              }
            }}
          >
            <Download className="size-4" />
            Instalar la app
          </Button>
        ) : (
          <IosSteps />
        )}
      </div>
    </div>
  );
}
