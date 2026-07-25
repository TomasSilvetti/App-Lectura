"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked } from "lucide-react";
import { toast } from "sonner";
import { UploadDropzone } from "@/components/library/upload-dropzone";
import { BookCard } from "@/components/library/book-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteBook,
  listBooks,
  requestPersistentStorage,
  saveBook,
  type BookMeta,
} from "@/lib/db";
import { detectFormat, importBook } from "@/lib/import-book";

export function LibraryView() {
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BookMeta | null>(null);

  const refresh = useCallback(async () => {
    setBooks(await listBooks());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listBooks();
      if (cancelled) return;
      setBooks(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFiles = async (files: File[]) => {
    const valid = files.filter((file) => detectFormat(file));
    const rejected = files.length - valid.length;
    if (rejected > 0) {
      toast.error(
        rejected === 1
          ? "Ese archivo no es un PDF ni un EPUB."
          : `${rejected} archivos no son PDF ni EPUB.`,
      );
    }
    if (!valid.length) return;

    await requestPersistentStorage();

    for (const [index, file] of valid.entries()) {
      setBusyLabel(
        valid.length > 1
          ? `Procesando ${index + 1} de ${valid.length}…`
          : `Procesando “${file.name}”…`,
      );
      try {
        const { meta, warning } = await importBook(file);
        await saveBook(
          { ...meta, id: crypto.randomUUID(), addedAt: Date.now() },
          file,
        );
        if (warning) {
          toast.warning(meta.title, { description: warning, duration: 8000 });
        } else {
          toast.success(`“${meta.title}” listo para leer`);
        }
      } catch (error) {
        console.error(error);
        toast.error(`No se pudo abrir “${file.name}”`, {
          description:
            error instanceof Error ? error.message : "El archivo puede estar dañado.",
        });
      }
    }

    setBusyLabel(null);
    await refresh();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteBook(pendingDelete.id);
    setPendingDelete(null);
    await refresh();
    toast.success("Libro eliminado");
  };

  const busy = busyLabel !== null;
  const hasBooks = books.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-5 sm:py-8">
      <UploadDropzone
        onFiles={(files) => void handleFiles(files)}
        busy={busy}
        busyLabel={busyLabel}
        compact={hasBooks}
      />

      <section className="mt-8">
        {loading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[2/3] w-full rounded-xl" />
                <Skeleton className="mt-2 h-4 w-4/5" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : hasBooks ? (
          <>
            <h2 className="font-heading mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Tus libros
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {books.map((book) => (
                <BookCard key={book.id} book={book} onDelete={setPendingDelete} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-14 text-center">
            <BookMarked className="size-12 text-muted-foreground/50" />
            <h2 className="font-heading mt-4 text-lg font-semibold">
              Todavía no subiste ningún libro
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Subí un PDF o un EPUB en inglés y vas a poder tocar cualquier
              palabra para escucharla y entenderla.
            </p>
          </div>
        )}
      </section>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar libro</DialogTitle>
            <DialogDescription>
              Se va a borrar “{pendingDelete?.title}” de este dispositivo junto
              con su progreso de lectura. Las palabras guardadas no se tocan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
