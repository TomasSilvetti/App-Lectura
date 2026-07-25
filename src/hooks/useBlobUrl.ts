"use client";

import { useEffect, useMemo } from "react";

/** Convierte un Blob de IndexedDB en una URL usable por <img>, y la libera al desmontar. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
