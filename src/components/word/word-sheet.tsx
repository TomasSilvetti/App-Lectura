"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  Loader2,
  MessageSquareQuote,
  Star,
  Volume2,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { lookupWord, partOfSpeechEs, type WordEntry } from "@/lib/dictionary";
import { playPronunciation, stopPlayback, type AudioSource } from "@/lib/speech";
import { getSavedWord, saveWord, deleteSavedWord } from "@/lib/db";
import { usePrefs } from "@/hooks/usePrefs";
import type { WordSource } from "@/components/word/word-lookup-provider";

interface WordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word: string;
  requestId: number;
  source: WordSource;
  onNavigate: (word: string, source?: WordSource) => void;
}

export function WordSheet({
  open,
  onOpenChange,
  word,
  requestId,
  source,
  onNavigate,
}: WordSheetProps) {
  const prefs = usePrefs();
  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [lastSource, setLastSource] = useState<AudioSource | null>(null);
  const [saved, setSaved] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const activeRequest = useRef(0);

  const play = useCallback(
    async (target: WordEntry | null, spoken: string) => {
      setPlaying(true);
      try {
        const result = await playPronunciation(spoken, {
          audioUrl: target?.audioUrl,
          preferHuman: prefs.preferHuman,
          voiceURI: prefs.voiceURI,
        });
        setLastSource(result);
      } finally {
        setPlaying(false);
      }
    },
    [prefs.preferHuman, prefs.voiceURI],
  );

  // Tocar otra palabra con el modal abierto reinicia el contenido sin cerrarlo.
  const [renderedRequest, setRenderedRequest] = useState(requestId);
  if (renderedRequest !== requestId) {
    setRenderedRequest(requestId);
    setEntry(null);
    setLoading(true);
    setShowExample(false);
    setLastSource(null);
    setSaved(false);
  }

  useEffect(() => {
    if (!open || !word) return;

    const id = requestId;
    activeRequest.current = id;
    let cancelled = false;

    void (async () => {
      const [savedHit, result] = await Promise.all([
        getSavedWord(word),
        lookupWord(word),
      ]);
      if (cancelled || activeRequest.current !== id) return;
      setSaved(Boolean(savedHit));
      setEntry(result);
      setLoading(false);
      if (prefs.autoPlay) {
        void play(result, result.word || word);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `play` y `prefs.autoPlay` se leen al disparar la búsqueda; volver a
    // ejecutar este efecto cuando cambian repetiría el audio sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, word, requestId]);

  useEffect(() => {
    if (!open) stopPlayback();
  }, [open]);

  const spokenWord = entry?.word || word;

  const toggleSaved = async () => {
    if (saved) {
      await deleteSavedWord(word);
      setSaved(false);
      return;
    }
    await saveWord({
      word,
      phonetic: entry?.phonetic ?? null,
      translation: entry?.translation ?? null,
      definition: entry?.senses[0]?.definitions[0]?.definition ?? null,
      example: entry?.example?.en ?? null,
      audioUrl: entry?.audioUrl ?? null,
      bookId: source.bookId ?? null,
      bookTitle: source.bookTitle ?? null,
      savedAt: Date.now(),
    });
    setSaved(true);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <DrawerContent className="mx-auto max-h-[86dvh] max-w-lg">
        <div className="scroll-clean overflow-x-hidden overflow-y-auto overscroll-contain px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {/* Cabecera: la palabra y el botón de pronunciación */}
          <div className="flex items-start gap-4 pt-2">
            <div className="min-w-0 flex-1">
              <DrawerTitle className="font-heading text-3xl leading-tight font-semibold break-words">
                {spokenWord}
              </DrawerTitle>
              {entry?.phonetic ? (
                <DrawerDescription className="mt-1 font-mono text-base">
                  {entry.phonetic}
                </DrawerDescription>
              ) : (
                <DrawerDescription className="sr-only">
                  Significado y pronunciación de {spokenWord}
                </DrawerDescription>
              )}
            </div>

            <button
              type="button"
              onClick={() => void play(entry, spokenWord)}
              disabled={loading}
              aria-label={`Escuchar la pronunciación de ${spokenWord}`}
              className={cn(
                "flex size-16 shrink-0 items-center justify-center rounded-full",
                "bg-primary text-primary-foreground shadow-md transition-all",
                "active:scale-95 disabled:opacity-60",
                playing && "animate-pulse ring-4 ring-primary/30",
              )}
            >
              {loading ? (
                <Loader2 className="size-7 animate-spin" />
              ) : (
                <Volume2 className="size-7" />
              )}
            </button>
          </div>

          {lastSource && (
            <p className="mt-2 text-xs text-muted-foreground">
              {lastSource === "human"
                ? "Voz grabada por una persona"
                : lastSource === "device"
                  ? "Voz del dispositivo"
                  : "No se pudo reproducir el audio"}
            </p>
          )}

          {loading && <LoadingBody />}

          {!loading && entry && (
            <div className="mt-5 space-y-5">
              {entry.translation && (
                <section className="rounded-xl bg-accent px-4 py-3">
                  <p className="text-xs font-medium tracking-wide text-accent-foreground/70 uppercase">
                    En español
                  </p>
                  <p className="font-heading mt-1 text-xl font-semibold text-accent-foreground">
                    {entry.translation}
                  </p>
                </section>
              )}

              {entry.senses.length > 0 && (
                <section className="space-y-4">
                  <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <BookOpenText className="size-3.5" />
                    Significado
                  </h3>
                  {entry.senses.map((sense) => (
                    <div key={sense.partOfSpeech} className="space-y-2">
                      <Badge variant="secondary" className="capitalize">
                        {partOfSpeechEs(sense.partOfSpeech)}
                      </Badge>
                      <ol className="ml-1 space-y-2">
                        {sense.definitions.map((def, i) => (
                          <li
                            key={`${sense.partOfSpeech}-${i}`}
                            className="flex gap-2.5 text-[0.95rem] leading-relaxed"
                          >
                            <span className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {i + 1}
                            </span>
                            <span>{def.definition}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </section>
              )}

              {entry.example && (
                <section>
                  {showExample ? (
                    <div className="rounded-xl border border-dashed px-4 py-3">
                      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <MessageSquareQuote className="size-3.5" />
                        Ejemplo de uso
                      </p>
                      <p className="mt-2 text-[0.95rem] leading-relaxed italic">
                        “{entry.example.en}”
                      </p>
                      {entry.example.es && (
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {entry.example.es}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowExample(true)}
                    >
                      <MessageSquareQuote className="size-4" />
                      Ver ejemplo de uso
                    </Button>
                  )}
                </section>
              )}

              {entry.synonyms.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Palabras parecidas
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.synonyms.map((syn) => (
                      <button
                        key={syn}
                        type="button"
                        onClick={() => onNavigate(syn, source)}
                        className="rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-accent"
                      >
                        {syn}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {!entry.found && (
                <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                  No encontramos esta palabra en el diccionario. Igual podés
                  escuchar cómo se pronuncia con el botón de arriba.
                </p>
              )}

              <Separator />

              <Button
                variant={saved ? "secondary" : "outline"}
                className="w-full"
                onClick={() => void toggleSaved()}
              >
                <Star className={cn("size-4", saved && "fill-current")} />
                {saved ? "Guardada en Mis palabras" : "Guardar palabra"}
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function LoadingBody() {
  return (
    <div className="mt-5 space-y-5">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}
