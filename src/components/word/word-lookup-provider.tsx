"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { WordSheet } from "@/components/word/word-sheet";

export interface WordSource {
  bookId?: string | null;
  bookTitle?: string | null;
}

interface WordLookupContextValue {
  openWord: (word: string, source?: WordSource) => void;
}

const WordLookupContext = createContext<WordLookupContextValue | null>(null);

export function useWordLookup(): WordLookupContextValue {
  const ctx = useContext(WordLookupContext);
  if (!ctx) {
    throw new Error("useWordLookup debe usarse dentro de WordLookupProvider");
  }
  return ctx;
}

export function WordLookupProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [source, setSource] = useState<WordSource>({});
  // Cambia en cada apertura para que el modal reinicie su estado interno.
  const [requestId, setRequestId] = useState(0);
  const counter = useRef(0);

  const openWord = useCallback((next: string, nextSource: WordSource = {}) => {
    counter.current += 1;
    setWord(next);
    setSource(nextSource);
    setRequestId(counter.current);
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ openWord }), [openWord]);

  return (
    <WordLookupContext.Provider value={value}>
      <div
        data-vaul-drawer-wrapper
        className="flex min-h-dvh flex-1 flex-col bg-background"
      >
        {children}
      </div>
      <WordSheet
        open={open}
        onOpenChange={setOpen}
        word={word}
        requestId={requestId}
        source={source}
        onNavigate={openWord}
      />
    </WordLookupContext.Provider>
  );
}
