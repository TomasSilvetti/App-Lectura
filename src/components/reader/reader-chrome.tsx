"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ThemeToggle } from "@/components/theme-toggle";
import type { BookMeta } from "@/lib/db";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 0.15;

interface ReaderChromeProps {
  book: BookMeta;
  position: number;
  total: number;
  positionLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onSeek?: (position: number) => void;
  /** Para el EPUB, donde la posición no se puede contar en páginas. */
  canPrev?: boolean;
  canNext?: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  children: React.ReactNode;
}

export function ReaderChrome({
  book,
  position,
  total,
  positionLabel,
  onPrev,
  onNext,
  onSeek,
  canPrev,
  canNext,
  zoom,
  onZoomChange,
  children,
}: ReaderChromeProps) {
  const prevDisabled = canPrev === undefined ? position <= 1 : !canPrev;
  const nextDisabled =
    canNext === undefined ? total > 0 && position >= total : !canNext;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea")) {
        return;
      }
      if (event.key === "ArrowLeft") onPrev();
      if (event.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);

  const setZoom = (next: number) =>
    onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(next.toFixed(2)))));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-background/85 px-2 backdrop-blur-md sm:px-3">
        <Button variant="ghost" size="icon" asChild aria-label="Volver a la biblioteca">
          <Link href="/">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <span className="font-heading mr-auto truncate text-sm font-medium sm:text-base">
          {book.title}
        </span>

        <div className="flex items-center rounded-full border">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            aria-label="Achicar el texto"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom(zoom - ZOOM_STEP)}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            aria-label="Agrandar el texto"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom(zoom + ZOOM_STEP)}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <ThemeToggle />
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>

      <footer className="shrink-0 border-t bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Página anterior"
            onClick={onPrev}
            disabled={prevDisabled}
          >
            <ChevronLeft className="size-5" />
          </Button>

          <div className="flex flex-1 flex-col gap-1">
            <span className="text-center text-xs text-muted-foreground tabular-nums">
              {positionLabel}
            </span>
            {onSeek && total > 1 && (
              <Slider
                value={[Math.min(position, total)]}
                min={1}
                max={total}
                step={1}
                aria-label="Ir a una página"
                onValueChange={([next]) => onSeek(next)}
              />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Página siguiente"
            onClick={onNext}
            disabled={nextDisabled}
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
