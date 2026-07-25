"use client";

import { useSyncExternalStore } from "react";

export interface Prefs {
  /** Multiplicador de tamaño de texto en el lector (1 = tamaño original) */
  fontScale: number;
  /** Voz del dispositivo elegida para el fallback de pronunciación */
  voiceURI: string | null;
  /** Priorizar el audio grabado por una persona cuando existe */
  preferHuman: boolean;
  /** Reproducir la pronunciación apenas se abre el modal */
  autoPlay: boolean;
}

const STORAGE_KEY = "lectura:prefs";

const DEFAULTS: Prefs = {
  fontScale: 1,
  voiceURI: null,
  preferHuman: true,
  autoPlay: true,
};

export const FONT_SCALE_MIN = 0.7;
export const FONT_SCALE_MAX = 2.2;
export const FONT_SCALE_STEP = 0.1;

const listeners = new Set<() => void>();
let cache: Prefs = DEFAULTS;
let loaded = false;

function readStorage(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      fontScale:
        typeof parsed.fontScale === "number"
          ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, parsed.fontScale))
          : DEFAULTS.fontScale,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      preferHuman: parsed.preferHuman ?? DEFAULTS.preferHuman,
      autoPlay: parsed.autoPlay ?? DEFAULTS.autoPlay,
    };
  } catch {
    return DEFAULTS;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Prefs {
  if (!loaded) {
    cache = readStorage();
    loaded = true;
  }
  return cache;
}

function getServerSnapshot(): Prefs {
  return DEFAULTS;
}

export function updatePrefs(patch: Partial<Prefs>): void {
  cache = { ...getSnapshot(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // modo privado o storage lleno: las preferencias siguen valiendo en memoria
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
