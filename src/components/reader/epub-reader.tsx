"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Book, Contents, Rendition } from "epubjs";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";
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
import { readThemeTokens, type ThemeTokens } from "@/lib/theme-tokens";
import type { BookMeta } from "@/lib/db";

interface EpubReaderProps {
  book: BookMeta;
  file: Blob;
  onProgress: (patch: { location: string; percent: number | null }) => void;
}

/**
 * Con muy pocas posiciones calculadas el porcentaje miente feo — un libro de
 * dos capítulos arranca marcando 100%. En ese caso preferimos no mostrarlo.
 */
const MIN_LOCATIONS = 5;

function safePercent(epubBook: Book, cfi: string): number | null {
  try {
    if ((epubBook.locations?.length() ?? 0) < MIN_LOCATIONS) return null;
    const value = epubBook.locations.percentageFromCfi(cfi);
    if (!Number.isFinite(value)) return null;
    return Math.min(1, Math.max(0, value));
  } catch {
    return null;
  }
}

/** Clave del <style> que la app inyecta en el documento del libro. */
const STYLE_KEY = "app-theme";

/**
 * Los tipos de epub.js declaran `getContents(): Contents`, pero en tiempo de
 * ejecución devuelve el array de los documentos montados (uno por página).
 */
function getContents(rendition: Rendition | null): Contents[] {
  if (!rendition) return [];
  return rendition.getContents() as unknown as Contents[];
}

/**
 * Hoja de estilos que la app impone dentro del iframe del EPUB.
 *
 * Criterio: en los dos temas mandan los colores de la app, no los del libro.
 * Casi todos los EPUB traen su propia hoja con algo como `p { color: #111 }` o
 * `body { background: #fff }`, pensada para papel blanco. Respetarla en claro y
 * pisarla solo en oscuro dejaba dos juegos de reglas distintos según el tema, y
 * cualquier desfasaje entre ellos terminaba en texto negro sobre fondo negro.
 * Emitir siempre las mismas reglas hace que el resultado dependa de un único
 * valor —el tema— y no del orden en que se fueron aplicando.
 *
 * `body, body *` gana por especificidad a las reglas de elemento del libro, y
 * pierde contra `.pw`, que es lo que queremos: el resaltado de la palabra
 * tocada sobrevive al barrido.
 */
function buildReaderCss(tokens: ThemeTokens, isDark: boolean): string {
  return `
body, body * {
  color: ${tokens.foreground} !important;
  background-color: transparent !important;
}
body a, body a:visited, body a * {
  color: ${tokens.primary} !important;
}
html, body {
  background-color: ${tokens.paper} !important;
  color-scheme: ${isDark ? "dark" : "light"};
}
body {
  line-height: 1.65;
  padding: 0 8px;
}
hr {
  border-color: ${tokens.border} !important;
}
.pw {
  border-radius: 0.2em;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.pw:hover {
  background-color: ${tokens.hover} !important;
}
.pw[data-active="true"] {
  background-color: ${tokens.active} !important;
}
`;
}

export function EpubReader({ book, file, onProgress }: EpubReaderProps) {
  const { openWord } = useWordLookup();
  const { resolvedTheme } = useTheme();

  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(book.percent);
  const [locationsReady, setLocationsReady] = useState(false);
  const [chapter, setChapter] = useState<string | null>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const { fontScale: zoom } = usePrefs();

  // El hook de contenido del EPUB corre fuera de React: lee estos refs para no
  // quedar atado a un render viejo.
  const openWordRef = useRef(openWord);
  const bookInfoRef = useRef({ id: book.id, title: book.title });
  const cssRef = useRef("");

  useEffect(() => {
    openWordRef.current = openWord;
  }, [openWord]);

  useEffect(() => {
    bookInfoRef.current = { id: book.id, title: book.title };
  }, [book.id, book.title]);

  /* ------------------------------------------------------------------ tema */

  const isDark = resolvedTheme === "dark";

  /*
   * Va antes del efecto de montaje a propósito: así, cuando el hook de
   * contenido corra (dentro de la promesa de aquel efecto, o sea después de
   * este), ya encuentra la hoja armada y el libro nunca aparece con los colores
   * originales antes de recibir los de la app.
   */
  useEffect(() => {
    const css = buildReaderCss(readThemeTokens(isDark), isDark);
    cssRef.current = css;
    // Reemplaza el contenido del mismo <style> en vez de apilar reglas nuevas:
    // apilarlas dejaba vivas las `!important` del tema anterior, y al volver a
    // claro el texto seguía pintado para fondo oscuro.
    getContents(renditionRef.current).forEach((contents) => {
      void contents.addStylesheetCss(css, STYLE_KEY);
    });
  }, [isDark]);

  /* ----------------------------------------------------- montaje del libro */

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      try {
        const { default: ePub } = await import("epubjs");
        const buffer = await file.arrayBuffer();
        if (disposed) return;

        const epubBook = ePub(buffer);
        bookRef.current = epubBook;
        await epubBook.ready;
        if (disposed) return;

        const rendition = epubBook.renderTo(host, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        rendition.hooks.content.register((contents: Contents) => {
          const doc = contents.document;
          // Cada página del EPUB es un iframe nuevo con la hoja original del
          // libro: hay que volver a imponerle la de la app.
          void contents.addStylesheetCss(cssRef.current, STYLE_KEY);
          wrapWordsInElement(doc.body);

          doc.addEventListener("click", (event) => {
            const hit = wordFromEvent(event);
            if (!hit) return;
            event.preventDefault();
            // Sin esto el foco se queda dentro del iframe y el modal no recibe
            // el Escape ni el resto de los atajos de teclado.
            doc.defaultView?.parent?.focus();
            setActiveWord(doc, hit.element);
            openWordRef.current(hit.word, {
              bookId: bookInfoRef.current.id,
              bookTitle: bookInfoRef.current.title,
            });
          });

          doc.addEventListener("pointerover", (event) => {
            if ((event as PointerEvent).pointerType !== "mouse") return;
            const hit = wordFromEvent(event);
            if (hit) prefetchWord(hit.word);
          });

          // Lo mismo con el deslizamiento: el dedo toca el documento del
          // iframe, no la página que lo contiene. El listener se va con él.
          attachSwipeNavigation(doc, {
            onPrev: () => void renditionRef.current?.prev(),
            onNext: () => void renditionRef.current?.next(),
          });

          // Con el foco dentro del iframe las flechas no llegan a la ventana
          // principal, así que la navegación se maneja también acá.
          doc.addEventListener("keydown", (event) => {
            const { key } = event as KeyboardEvent;
            if (key === "ArrowLeft") void renditionRef.current?.prev();
            if (key === "ArrowRight") void renditionRef.current?.next();
          });
        });

        rendition.on("relocated", (location: {
          start?: { cfi?: string; href?: string };
          atStart?: boolean;
          atEnd?: boolean;
        }) => {
          setEdges({
            atStart: Boolean(location?.atStart),
            atEnd: Boolean(location?.atEnd),
          });

          const cfi = location?.start?.cfi;
          if (!cfi) return;

          const nextPercent = safePercent(epubBook, cfi);
          setPercent(nextPercent);
          onProgress({ location: cfi, percent: nextPercent });

          const href = location?.start?.href;
          const navItem = href ? epubBook.navigation?.get(href) : null;
          setChapter(navItem?.label?.trim() || null);
        });

        await rendition.display(book.location ?? undefined);
        if (disposed) return;
        setReady(true);

        // Calcular las posiciones permite mostrar el porcentaje y saltar por
        // el libro; en un libro grande tarda unos segundos, así que va suelto.
        void epubBook.locations.generate(1200).then(() => {
          if (disposed) return;
          const usable = (epubBook.locations?.length() ?? 0) >= MIN_LOCATIONS;
          setLocationsReady(usable);
          if (!usable) return;

          const location = rendition.currentLocation() as unknown as {
            start?: { cfi?: string };
          };
          const current = location?.start?.cfi;
          if (current) setPercent(safePercent(epubBook, current));
        });
      } catch (err) {
        console.error(err);
        if (!disposed) setError("No se pudo abrir este EPUB.");
      }
    })();

    return () => {
      disposed = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
    };
    // Solo debe montarse una vez por archivo: el resto se maneja por efectos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  /* ------------------------------------------------------------- tamaño */

  useEffect(() => {
    if (!ready) return;
    renditionRef.current?.themes.fontSize(`${Math.round(zoom * 100)}%`);
  }, [ready, zoom]);

  /* -------------------------------------------------------------- resize */

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !ready) return;
    const observer = new ResizeObserver(() => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      try {
        rendition.resize(host.clientWidth, host.clientHeight);
      } catch {
        // el rendition puede estar desmontándose
      }
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [ready]);

  /* --------------------------------------------------------- navegación */

  const goPrev = useCallback(() => {
    void renditionRef.current?.prev();
  }, []);
  const goNext = useCallback(() => {
    void renditionRef.current?.next();
  }, []);
  const seek = useCallback((value: number) => {
    const epubBook = bookRef.current;
    const rendition = renditionRef.current;
    if (!epubBook || !rendition || !epubBook.locations?.length()) return;
    const cfi = epubBook.locations.cfiFromPercentage(value / 100);
    if (cfi) void rendition.display(cfi);
  }, []);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const percentValue = percent != null ? Math.round(percent * 100) : 0;
  const positionLabel =
    percent != null
      ? `${percentValue}%${chapter ? ` · ${chapter}` : ""}`
      : (chapter ?? "Cargando…");

  return (
    <ReaderChrome
      book={book}
      position={Math.max(1, percentValue)}
      total={locationsReady ? 100 : 0}
      positionLabel={positionLabel}
      onPrev={goPrev}
      onNext={goNext}
      onSeek={locationsReady ? seek : undefined}
      canPrev={!edges.atStart}
      canNext={!edges.atEnd}
      zoom={zoom}
      onZoomChange={(fontScale) => updatePrefs({ fontScale })}
    >
      <div className="flex min-h-0 flex-1 justify-center p-3">
        <div className="epub-surface relative w-full max-w-3xl overflow-hidden">
          <div ref={hostRef} className="size-full" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </ReaderChrome>
  );
}
