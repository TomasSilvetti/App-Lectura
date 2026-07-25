"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * `false` durante el render del servidor y la hidratación, `true` después.
 * Sirve para lo que solo existe en el navegador (tema resuelto, voces, etc.)
 * sin provocar un desajuste de hidratación.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(noop, onClient, onServer);
}
