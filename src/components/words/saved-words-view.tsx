"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search, Star, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { deleteSavedWord, listSavedWords, type SavedWord } from "@/lib/db";
import { playPronunciation } from "@/lib/speech";
import { usePrefs } from "@/hooks/usePrefs";

function toCsv(words: SavedWord[]): string {
  const escape = (value: string | null) =>
    `"${(value ?? "").replace(/"/g, '""')}"`;
  const rows = words.map((w) =>
    [w.word, w.translation, w.definition, w.example, w.bookTitle]
      .map(escape)
      .join(","),
  );
  return ["Palabra,Traducción,Significado,Ejemplo,Libro", ...rows].join("\n");
}

export function SavedWordsView() {
  const prefs = usePrefs();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  useEffect(() => {
    void listSavedWords()
      .then(setWords)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return words;
    return words.filter(
      (w) =>
        w.word.includes(q) ||
        w.translation?.toLowerCase().includes(q) ||
        w.definition?.toLowerCase().includes(q),
    );
  }, [words, query]);

  const play = async (word: SavedWord) => {
    setSpeaking(word.word);
    try {
      await playPronunciation(word.word, {
        audioUrl: word.audioUrl,
        preferHuman: prefs.preferHuman,
        voiceURI: prefs.voiceURI,
      });
    } finally {
      setSpeaking(null);
    }
  };

  const remove = async (word: SavedWord) => {
    await deleteSavedWord(word.word);
    setWords((prev) => prev.filter((w) => w.word !== word.word));
    toast.success(`“${word.word}” eliminada`);
  };

  const exportCsv = () => {
    const blob = new Blob([`﻿${toCsv(words)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mis-palabras.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una palabra…"
            className="pl-9"
            aria-label="Buscar entre las palabras guardadas"
          />
        </div>
        {words.length > 0 && (
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" />
            <span className="max-sm:sr-only">Exportar</span>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="mt-5 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : words.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Star className="size-12 text-muted-foreground/50" />
          <h2 className="font-heading mt-4 text-lg font-semibold">
            Todavía no guardaste ninguna palabra
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Mientras leés, tocá una palabra y después el botón “Guardar palabra”
            para que aparezca acá.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Ninguna palabra coincide con “{query}”.
        </p>
      ) : (
        <ul className="mt-5 divide-y rounded-xl border bg-card">
          {filtered.map((word) => {
            const isOpen = expanded === word.word;
            return (
              <li key={word.word}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : word.word)}
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-heading font-medium">{word.word}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {word.translation ?? word.definition ?? "Sin traducción"}
                    </p>
                  </button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Escuchar ${word.word}`}
                    onClick={() => void play(word)}
                  >
                    <Volume2
                      className={cn(
                        "size-5",
                        speaking === word.word && "text-primary",
                      )}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${word.word}`}
                    onClick={() => void remove(word)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-2 px-3 pb-3 text-sm">
                    {word.definition && <p>{word.definition}</p>}
                    {word.example && (
                      <p className="text-muted-foreground italic">
                        “{word.example}”
                      </p>
                    )}
                    {word.bookTitle && (
                      <p className="text-xs text-muted-foreground">
                        De: {word.bookTitle}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
