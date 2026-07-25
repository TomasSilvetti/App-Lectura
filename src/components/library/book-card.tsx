"use client";

import Link from "next/link";
import { BookOpen, MoreVertical, ScanLine, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useBlobUrl } from "@/hooks/useBlobUrl";
import type { BookMeta } from "@/lib/db";

function progressLabel(book: BookMeta): string {
  if (book.format === "pdf") {
    if (!book.lastReadAt) return `${book.totalPages} páginas`;
    return `Página ${book.page} de ${book.totalPages}`;
  }
  if (book.percent != null) return `${Math.round(book.percent * 100)}% leído`;
  return book.lastReadAt ? "Empezado" : "Sin empezar";
}

function progressRatio(book: BookMeta): number {
  if (!book.lastReadAt) return 0;
  if (book.format === "pdf" && book.totalPages > 0) {
    return Math.min(1, book.page / book.totalPages);
  }
  return book.percent ?? 0;
}

export function BookCard({
  book,
  onDelete,
}: {
  book: BookMeta;
  onDelete: (book: BookMeta) => void;
}) {
  const coverUrl = useBlobUrl(book.cover);
  const ratio = progressRatio(book);

  return (
    <div className="group relative">
      <Link
        href={`/leer/${book.id}`}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border bg-muted shadow-sm transition-shadow group-hover:shadow-md">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-secondary">
              <BookOpen className="size-10 text-muted-foreground" />
            </div>
          )}

          {!book.hasText && (
            <div
              className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[0.7rem] font-medium shadow-sm"
              title="PDF escaneado: no se pueden tocar las palabras"
            >
              <ScanLine className="size-3" />
              Escaneado
            </div>
          )}

          {ratio > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-foreground/20">
              <div
                className="h-full bg-primary"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          )}
        </div>

        <h3 className="mt-2 line-clamp-2 text-sm leading-snug font-medium">
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground">{progressLabel(book)}</p>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Opciones de ${book.title}`}
            className="absolute top-2 right-2 size-8 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-sm:opacity-100"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(book)}>
            <Trash2 className="size-4" />
            Eliminar libro
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
