"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Pinta la barra del navegador y la barra de estado del celular del mismo
 * color que la app.
 *
 * El `themeColor` que genera Next depende de `prefers-color-scheme`, o sea del
 * tema del sistema operativo. Como acá el tema lo elige la persona dentro de la
 * app, esas etiquetas quedan desfasadas: alguien con el celular en claro y la
 * app en oscuro veía la barra clara contra una app oscura.
 */
function toHex(cssColor: string): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

export function ThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
    // El valor está en oklch: el canvas lo convierte a un hex que entienden
    // todos los navegadores, incluidos los que no soportan oklch en el meta.
    const hex = background ? toHex(background) : null;
    if (!hex) return;

    /*
     * Etiqueta propia, marcada con data-owner. Nunca tocar las que renderiza
     * React: sacarle nodos del head por debajo le rompe la reconciliación y la
     * navegación deja de funcionar.
     */
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"][data-owner="app"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.dataset.owner = "app";
      document.head.appendChild(meta);
    }
    meta.content = hex;
  }, [resolvedTheme]);

  return null;
}
