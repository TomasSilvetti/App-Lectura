"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { readThemeTokens, toHex } from "@/lib/theme-tokens";

/**
 * Pinta la barra de estado del celular y la del navegador del mismo color que
 * la app.
 *
 * El `themeColor` que genera Next depende de `prefers-color-scheme`, o sea del
 * tema del sistema operativo. Como acá el tema lo elige la persona dentro de la
 * app, esas etiquetas quedan desfasadas: alguien con el celular en claro y la
 * app en oscuro veía la barra clara contra una app oscura.
 *
 * La barra de navegación de Android (los tres botones de abajo) no sale de acá
 * sino de `color-scheme`, que globals.css declara junto con la paleta.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;
    const { background } = readThemeTokens(resolvedTheme === "dark");
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
