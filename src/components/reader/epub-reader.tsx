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
import { useWordLookup } from "@/components/word/word-lookup-provider";
import { ReaderChrome } from "@/components/reader/reader-chrome";
import { updatePrefs, usePrefs } from "@/hooks/usePrefs";
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

/** Todo lo que puede llevar texto dentro de un EPUB y hay que forzar en oscuro. */
const TEXT_SELECTORS = [
  "body",
  "p",
  "div",
  "span",
  "li",
  "dd",
  "dt",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "cite",
  "small",
  "strong",
  "em",
  "b",
  "i",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
].join(", ");

/** Lee los colores del tema actual para replicarlos dentro del iframe del EPUB. */
function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string) => styles.getPropertyValue(name).trim();
  return {
    foreground: value("--foreground"),
    paper: value("--reader-paper"),
    primary: value("--primary"),
    hover: value("--word-hover"),
    active: value("--word-active"),
    muted: value("--muted-foreground"),
  };
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

  useEffect(() => {
    openWordRef.current = openWord;
  }, [openWord]);

  useEffect(() => {
    bookInfoRef.current = { id: book.id, title: book.title };
  }, [book.id, book.title]);

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

  /* ------------------------------------------------------- tema y tamaño */

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !ready) return;

    const isDark = resolvedTheme === "dark";
    const colors = readThemeColors();

    rendition.themes.default({
      /*
       * Tiene que ser el color concreto, no "transparent": un iframe cuyo
       * documento no declara fondo se pinta con el blanco por defecto del
       * navegador, y en modo oscuro quedaba una hoja blanca aunque el texto ya
       * fuera claro.
       */
      "html, body": {
        "background-color": `${colors.paper} !important`,
        "color-scheme": isDark ? "dark" : "light",
      },
      body: {
        color: colors.foreground,
        "line-height": "1.65",
        padding: "0 8px",
      },
      "a, a:visited": { color: colors.primary },
      "h1, h2, h3, h4, h5, h6": { color: colors.foreground },
      ".pw": { "border-radius": "0.2em", cursor: "pointer" },
      ".pw:hover": { "background-color": colors.hover },
      '.pw[data-active="true"]': { "background-color": colors.active },

      /*
       * Casi todos los EPUB traen su propia hoja de estilos con algo como
       * `p { color: #111 }`, que le gana a la regla de `body` y deja el texto
       * negro sobre fondo negro. En oscuro forzamos el color; en claro
       * respetamos el diseño original del libro.
       */
      ...(isDark
        ? {
            [TEXT_SELECTORS]: { color: `${colors.foreground} !important` },
            "a, a:visited, a *": { color: `${colors.primary} !important` },
            "[style*='background']": {
              "background-color": "transparent !important",
            },
          }
        : {}),
    });
    // Los estilos registrados no se re-aplican solos a lo que ya está en
    // pantalla; hay que forzar la actualización al cambiar de tema.
    rendition.themes.update("default");
    rendition.themes.fontSize(`${Math.round(zoom * 100)}%`);
  }, [ready, resolvedTheme, zoom]);

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
