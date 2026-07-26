"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Loader2, ScanLine } from "lucide-react";
import { getPdfjs, openPdf } from "@/lib/pdf";
import {
  setActiveWord,
  wordFromEvent,
  wrapWordsInElement,
} from "@/lib/wrap-words";
import { prefetchWord } from "@/lib/dictionary";
import { attachSwipeNavigation } from "@/lib/swipe";
import { useWordLookup } from "@/components/word/word-lookup-provider";
import { ReaderChrome } from "@/components/reader/reader-chrome";
import { updatePrefs, usePrefs } from "@/hooks/usePrefs";
import type { BookMeta } from "@/lib/db";

interface PdfReaderProps {
  book: BookMeta;
  file: Blob;
  onProgress: (patch: { page: number }) => void;
}

export function PdfReader({ book, file, onProgress }: PdfReaderProps) {
  const { openWord } = useWordLookup();

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(Math.max(1, book.page));
  const [containerWidth, setContainerWidth] = useState(0);
  const { fontScale: zoom } = usePrefs();
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = doc?.numPages ?? book.totalPages;

  /* ------------------------------------------------------------- documento */

  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | null = null;

    void (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const opened = await openPdf(buffer);
        if (cancelled) {
          opened.close();
          return;
        }
        close = opened.close;
        setDoc(opened.doc);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("No se pudo abrir este PDF.");
      }
    })();

    return () => {
      cancelled = true;
      close?.();
    };
  }, [file]);

  /* --------------------------------------------------- ancho disponible */

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ----------------------------------------------------------- renderizado */

  useEffect(() => {
    if (!doc || containerWidth <= 0) return;
    const canvas = canvasRef.current;
    const textLayerDiv = textLayerRef.current;
    if (!canvas || !textLayerDiv) return;

    let cancelled = false;
    setRendering(true);

    void (async () => {
      try {
        const pdfjs = await getPdfjs();
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        const unscaled = pdfPage.getViewport({ scale: 1 });
        // Deja aire a los costados para que el texto no toque los bordes.
        const available = Math.max(240, containerWidth - 24);
        const scale = (available / unscaled.width) * zoom;
        const viewport = pdfPage.getViewport({ scale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderViewport = pdfPage.getViewport({ scale: scale * dpr });

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvas, viewport: renderViewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        textLayerDiv.replaceChildren();
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));

        const textLayer = new pdfjs.TextLayer({
          textContentSource: await pdfPage.getTextContent(),
          container: textLayerDiv,
          viewport,
        });
        await textLayer.render();
        if (cancelled) {
          textLayerDiv.replaceChildren();
          return;
        }

        // pdf.js ya midió cada línea; recién ahora partimos el texto en
        // palabras para no alterar el cálculo de posiciones.
        textLayer.textDivs.forEach((div) => wrapWordsInElement(div));
        setRendering(false);
      } catch (err) {
        if (cancelled) return;
        // Cancelar un render en curso lanza, y es esperable al pasar de página.
        if (err instanceof Error && err.name === "RenderingCancelledException") {
          return;
        }
        console.error(err);
        setError("No se pudo mostrar esta página.");
        setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, page, containerWidth, zoom]);

  /* ---------------------------------------------------------- interacción */

  useEffect(() => {
    const layer = textLayerRef.current;
    if (!layer) return;

    const onClick = (event: MouseEvent) => {
      const hit = wordFromEvent(event);
      if (!hit) return;
      setActiveWord(layer, hit.element);
      openWord(hit.word, { bookId: book.id, bookTitle: book.title });
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const hit = wordFromEvent(event);
      if (hit) prefetchWord(hit.word);
    };

    layer.addEventListener("click", onClick);
    layer.addEventListener("pointerover", onPointerOver);
    return () => {
      layer.removeEventListener("click", onClick);
      layer.removeEventListener("pointerover", onPointerOver);
    };
  }, [openWord, book.id, book.title]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(1, next), totalPages || 1);
      setPage(clamped);
      onProgress({ page: clamped });
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [totalPages, onProgress],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    return attachSwipeNavigation(element, {
      onPrev: () => goTo(page - 1),
      onNext: () => goTo(page + 1),
      // Con el texto ampliado la página no entra a lo ancho y el gesto sirve
      // para correrse hasta el margen.
      isScrollableX: () => element.scrollWidth - element.clientWidth > 2,
    });
  }, [goTo, page]);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <ReaderChrome
      book={book}
      position={page}
      total={totalPages}
      positionLabel={`Página ${page} de ${totalPages || "?"}`}
      onPrev={() => goTo(page - 1)}
      onNext={() => goTo(page + 1)}
      onSeek={goTo}
      zoom={zoom}
      onZoomChange={(fontScale) => updatePrefs({ fontScale })}
    >
      <div
        ref={scrollRef}
        className="scroll-clean flex-1 overflow-auto overscroll-contain px-3 py-4"
      >
        {!book.hasText && (
          <div className="mx-auto mb-4 flex max-w-2xl items-start gap-3 rounded-xl border border-dashed bg-card px-4 py-3">
            <ScanLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Este PDF es un escaneo: las páginas son imágenes, así que no se
              pueden tocar las palabras. Se puede leer igual.
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <div className="page-surface" data-rendering={rendering}>
            <canvas ref={canvasRef} />
            <div ref={textLayerRef} className="textLayer" />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/60">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>
    </ReaderChrome>
  );
}
