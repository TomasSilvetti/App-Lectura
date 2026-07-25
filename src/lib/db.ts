import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { WordEntry } from "@/lib/dictionary";

export type BookFormat = "pdf" | "epub";

/** Metadata liviana: es lo único que carga la biblioteca. */
export interface BookMeta {
  id: string;
  title: string;
  format: BookFormat;
  fileName: string;
  size: number;
  addedAt: number;
  lastReadAt: number | null;
  cover: Blob | null;
  /** false cuando el PDF es un escaneo sin capa de texto */
  hasText: boolean;
  /** PDF: página actual (1-based). EPUB: siempre 1. */
  page: number;
  totalPages: number;
  /** EPUB: CFI de la última posición leída */
  location: string | null;
  /** EPUB: porcentaje 0–1 cuando ya se generaron las locations */
  percent: number | null;
}

export interface SavedWord {
  word: string;
  phonetic: string | null;
  translation: string | null;
  definition: string | null;
  example: string | null;
  audioUrl: string | null;
  bookId: string | null;
  bookTitle: string | null;
  savedAt: number;
}

interface CachedLookup {
  word: string;
  entry: WordEntry;
  cachedAt: number;
}

interface LecturaDB extends DBSchema {
  books: { key: string; value: BookMeta; indexes: { addedAt: number } };
  files: { key: string; value: { id: string; blob: Blob } };
  words: { key: string; value: SavedWord; indexes: { savedAt: number } };
  lookups: { key: string; value: CachedLookup };
}

let dbPromise: Promise<IDBPDatabase<LecturaDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<LecturaDB>("lectura", 1, {
      upgrade(db) {
        const books = db.createObjectStore("books", { keyPath: "id" });
        books.createIndex("addedAt", "addedAt");
        db.createObjectStore("files", { keyPath: "id" });
        const words = db.createObjectStore("words", { keyPath: "word" });
        words.createIndex("savedAt", "savedAt");
        db.createObjectStore("lookups", { keyPath: "word" });
      },
    });
  }
  return dbPromise;
}

/* ------------------------------------------------------------------ libros */

export async function listBooks(): Promise<BookMeta[]> {
  const db = await getDB();
  const books = await db.getAllFromIndex("books", "addedAt");
  return books.reverse();
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  return (await getDB()).get("books", id);
}

export async function getBookFile(id: string): Promise<Blob | undefined> {
  return (await (await getDB()).get("files", id))?.blob;
}

export async function saveBook(meta: BookMeta, file: Blob): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["books", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").put(meta),
    tx.objectStore("files").put({ id: meta.id, blob: file }),
    tx.done,
  ]);
}

export async function updateBook(
  id: string,
  patch: Partial<BookMeta>,
): Promise<void> {
  const db = await getDB();
  const current = await db.get("books", id);
  if (!current) return;
  await db.put("books", { ...current, ...patch });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["books", "files"], "readwrite");
  await Promise.all([
    tx.objectStore("books").delete(id),
    tx.objectStore("files").delete(id),
    tx.done,
  ]);
}

/* ------------------------------------------------------------- vocabulario */

export async function listSavedWords(): Promise<SavedWord[]> {
  const db = await getDB();
  return (await db.getAllFromIndex("words", "savedAt")).reverse();
}

export async function getSavedWord(word: string) {
  return (await getDB()).get("words", word.toLowerCase());
}

export async function saveWord(entry: SavedWord): Promise<void> {
  const db = await getDB();
  await db.put("words", { ...entry, word: entry.word.toLowerCase() });
}

export async function deleteSavedWord(word: string): Promise<void> {
  const db = await getDB();
  await db.delete("words", word.toLowerCase());
}

/* ------------------------------------------------ cache de búsquedas */

const CACHE_TTL = 1000 * 60 * 60 * 24 * 90;

export async function getCachedLookup(
  word: string,
): Promise<WordEntry | undefined> {
  try {
    const db = await getDB();
    const hit = await db.get("lookups", word.toLowerCase());
    if (!hit) return undefined;
    if (Date.now() - hit.cachedAt > CACHE_TTL) return undefined;
    return hit.entry;
  } catch {
    return undefined;
  }
}

export async function setCachedLookup(
  word: string,
  entry: WordEntry,
): Promise<void> {
  try {
    const db = await getDB();
    await db.put("lookups", {
      word: word.toLowerCase(),
      entry,
      cachedAt: Date.now(),
    });
  } catch {
    // el cache es un lujo, nunca debe romper la búsqueda
  }
}

/* ---------------------------------------------------------- mantenimiento */

export async function clearEverything(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["books", "files", "words", "lookups"], "readwrite");
  await Promise.all([
    tx.objectStore("books").clear(),
    tx.objectStore("files").clear(),
    tx.objectStore("words").clear(),
    tx.objectStore("lookups").clear(),
    tx.done,
  ]);
}

export async function getStorageUsage(): Promise<{
  used: number;
  quota: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return null;
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { used: usage, quota };
}

/**
 * Le pide al navegador que no descarte estos datos cuando falte espacio.
 * Sin esto el sistema puede borrar los libros sin avisar.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
