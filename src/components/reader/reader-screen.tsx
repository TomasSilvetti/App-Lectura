"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfReader } from "@/components/reader/pdf-reader";
import { EpubReader } from "@/components/reader/epub-reader";
import { getBook, getBookFile, updateBook, type BookMeta } from "@/lib/db";

export function ReaderScreen({ id }: { id: string }) {
  const [book, setBook] = useState<BookMeta | null>(null);
  const [file, setFile] = useState<Blob | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meta, blob] = await Promise.all([getBook(id), getBookFile(id)]);
      if (cancelled) return;
      if (!meta || !blob) {
        setStatus("missing");
        return;
      }
      setBook(meta);
      setFile(blob);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Guardar en cada página pasada sería escribir de más: alcanza con hacerlo
  // poco después de que la lectura se queda quieta.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveProgress = useCallback(
    (patch: Partial<BookMeta>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateBook(id, { ...patch, lastReadAt: Date.now() });
      }, 600);
    },
    [id],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "missing" || !book || !file) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <div>
          <h1 className="font-heading text-lg font-semibold">
            No encontramos este libro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Puede que se haya borrado, o que lo hayas subido en otro dispositivo.
          </p>
        </div>
        <Button asChild>
          <Link href="/">Ir a la biblioteca</Link>
        </Button>
      </div>
    );
  }

  return book.format === "pdf" ? (
    <PdfReader book={book} file={file} onProgress={saveProgress} />
  ) : (
    <EpubReader book={book} file={file} onProgress={saveProgress} />
  );
}
