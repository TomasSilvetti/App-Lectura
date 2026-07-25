"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  updatePrefs,
  usePrefs,
} from "@/hooks/usePrefs";
import { InstallApp } from "@/components/pwa/install-app";
import { playPronunciation } from "@/lib/speech";
import { useEnglishVoices } from "@/hooks/useEnglishVoices";
import { useIsMounted } from "@/hooks/useIsMounted";
import { clearEverything, getStorageUsage } from "@/lib/db";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1).replace(".", ",")} ${units[unit]}`;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-heading font-semibold">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const prefs = usePrefs();
  const mounted = useIsMounted();
  const voices = useEnglishVoices();
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const estimate = await getStorageUsage();
      if (!cancelled) setUsage(estimate);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const themeOptions = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Automático", icon: Monitor },
  ];

  const clearAll = async () => {
    await clearEverything();
    setConfirmClear(false);
    setUsage(await getStorageUsage());
    toast.success("Se borraron todos los datos de este dispositivo");
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-6 sm:px-5">
      <Section
        title="Instalar la app"
        description="Queda con su propio ícono en la pantalla de inicio y abre sin la barra del navegador."
      >
        <InstallApp />
      </Section>

      <Section title="Apariencia">
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const active = mounted && theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border py-3 text-sm transition-colors",
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : "hover:bg-secondary",
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Tamaño de la letra"
        description="Se aplica a los libros que estés leyendo."
      >
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">A</span>
          <Slider
            value={[prefs.fontScale]}
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            aria-label="Tamaño de la letra"
            onValueChange={([fontScale]) => updatePrefs({ fontScale })}
          />
          <span className="text-2xl text-muted-foreground">A</span>
        </div>
        <p
          className="mt-4 rounded-lg bg-secondary px-4 py-3 leading-relaxed"
          style={{ fontSize: `${prefs.fontScale}rem` }}
        >
          The morning light came through the window.
        </p>
      </Section>

      <Section
        title="Pronunciación"
        description="Cuando existe, se usa un audio grabado por una persona. Si no, habla el dispositivo."
      >
        <div className="divide-y">
          <Row
            label="Reproducir al abrir una palabra"
            hint="El audio suena solo, sin tener que tocar nada"
          >
            <Switch
              checked={prefs.autoPlay}
              onCheckedChange={(autoPlay) => updatePrefs({ autoPlay })}
              aria-label="Reproducir al abrir una palabra"
            />
          </Row>

          <Row
            label="Preferir voz humana"
            hint="Usa el audio real del diccionario cuando está disponible"
          >
            <Switch
              checked={prefs.preferHuman}
              onCheckedChange={(preferHuman) => updatePrefs({ preferHuman })}
              aria-label="Preferir voz humana"
            />
          </Row>

          <div className="space-y-2 py-3">
            <p className="text-sm font-medium">Voz del dispositivo</p>
            {voices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Este navegador todavía no cargó ninguna voz en inglés.
              </p>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={prefs.voiceURI ?? "auto"}
                  onValueChange={(value) =>
                    updatePrefs({ voiceURI: value === "auto" ? null : value })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Elegir la mejor automáticamente</SelectItem>
                    {voices.map((voice) => (
                      <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() =>
                    void playPronunciation("beautiful", {
                      preferHuman: false,
                      voiceURI: prefs.voiceURI,
                    })
                  }
                >
                  <Volume2 className="size-4" />
                  Probar
                </Button>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Almacenamiento"
        description="Todo se guarda solo en este dispositivo. Nada se sube a internet."
      >
        {usage && (
          <p className="text-sm text-muted-foreground">
            Estás usando <strong>{formatBytes(usage.used)}</strong>
            {usage.quota > 0 && ` de ${formatBytes(usage.quota)} disponibles`}.
          </p>
        )}
        <Button
          variant="destructive"
          className="mt-4 w-full"
          onClick={() => setConfirmClear(true)}
        >
          Borrar todos los libros y palabras
        </Button>
      </Section>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrar todo</DialogTitle>
            <DialogDescription>
              Se van a eliminar todos los libros, el progreso de lectura y las
              palabras guardadas de este dispositivo. Esto no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void clearAll()}>
              Borrar todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
