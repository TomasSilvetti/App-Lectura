"use client";

import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/** Los pasos de iOS, que es el único caso donde hay que hacerlo a mano. */
export function IosSteps() {
  return (
    <ol className="space-y-2.5 text-sm">
      <li className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
          1
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          Tocá el botón Compartir
          <Share className="size-4 text-primary" />
          abajo en la pantalla
        </span>
      </li>
      <li className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
          2
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          Elegí
          <strong className="font-medium">Agregar a inicio</strong>
          <SquarePlus className="size-4 text-primary" />
        </span>
      </li>
      <li className="flex items-center gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
          3
        </span>
        <span>
          Confirmá con <strong className="font-medium">Agregar</strong>
        </span>
      </li>
    </ol>
  );
}

export function InstallApp() {
  const { state, install } = useInstallPrompt();

  if (state === "loading") return null;

  if (state === "installed") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" />
        Ya está instalada en este dispositivo.
      </p>
    );
  }

  if (state === "available") {
    return (
      <Button
        className="w-full"
        onClick={async () => {
          const accepted = await install();
          if (accepted) toast.success("Lectura se instaló en tu dispositivo");
        }}
      >
        <Download className="size-4" />
        Instalar la app
      </Button>
    );
  }

  if (state === "ios") return <IosSteps />;

  return (
    <p className="text-sm text-muted-foreground">
      Este navegador no ofrece instalar aplicaciones. Abrí la página en Chrome
      (Android) o en Safari (iPhone y iPad) y vas a poder agregarla a la
      pantalla de inicio.
    </p>
  );
}
