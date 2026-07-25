import type { BookFormat, BookMeta } from "@/lib/db";
import { openPdf } from "@/lib/pdf";

const COVER_WIDTH = 320;

export function detectFormat(file: File): BookFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".epub") || file.type === "application/epub+zip") {
    return "epub";
  }
  return null;
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.(pdf|epub)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.75),
  );
}

interface ImportResult {
  meta: Omit<BookMeta, "id" | "addedAt">;
  warning: string | null;
}

async function importPdf(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const { doc, close } = await openPdf(buffer);

  let title = titleFromFileName(file.name);
  try {
    const metadata = await doc.getMetadata();
    const info = metadata.info as { Title?: string } | undefined;
    const metaTitle = info?.Title?.trim();
    // Muchos PDFs traen basura tipo "Microsoft Word - doc1" en el título.
    if (metaTitle && metaTitle.length > 2 && !/^(untitled|microsoft word)/i.test(metaTitle)) {
      title = metaTitle;
    }
  } catch {
    // sin metadata: nos quedamos con el nombre del archivo
  }

  // Un PDF escaneado no tiene capa de texto y no permite tocar palabras.
  let charCount = 0;
  const probePages = Math.min(doc.numPages, 3);
  for (let i = 1; i <= probePages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    charCount += content.items.reduce(
      (sum, item) => sum + ("str" in item ? item.str.trim().length : 0),
      0,
    );
    if (charCount > 60) break;
  }
  const hasText = charCount > 60;

  let cover: Blob | null = null;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    cover = await canvasToBlob(canvas);
  } catch {
    // sin portada: la biblioteca muestra un placeholder
  }

  const totalPages = doc.numPages;
  close();

  return {
    meta: {
      title,
      format: "pdf",
      fileName: file.name,
      size: file.size,
      lastReadAt: null,
      cover,
      hasText,
      page: 1,
      totalPages,
      location: null,
      percent: null,
    },
    warning: hasText
      ? null
      : "Este PDF parece un escaneo: es una imagen y no tiene texto, así que no vas a poder tocar las palabras.",
  };
}

async function importEpub(file: File): Promise<ImportResult> {
  const { default: ePub } = await import("epubjs");
  const buffer = await file.arrayBuffer();
  const book = ePub(buffer);
  await book.ready;

  const metaTitle = book.packaging?.metadata?.title?.trim();
  const title = metaTitle && metaTitle.length > 1 ? metaTitle : titleFromFileName(file.name);

  let cover: Blob | null = null;
  try {
    const coverUrl = await book.coverUrl();
    if (coverUrl) {
      cover = await (await fetch(coverUrl)).blob();
      URL.revokeObjectURL(coverUrl);
    }
  } catch {
    // sin portada
  }

  book.destroy();

  return {
    meta: {
      title,
      format: "epub",
      fileName: file.name,
      size: file.size,
      lastReadAt: null,
      cover,
      hasText: true,
      page: 1,
      // El EPUB no tiene páginas fijas: el avance se mide en porcentaje.
      totalPages: 0,
      location: null,
      percent: null,
    },
    warning: null,
  };
}

export async function importBook(file: File): Promise<ImportResult> {
  const format = detectFormat(file);
  if (!format) throw new Error("Formato no soportado. Solo PDF y EPUB.");
  return format === "pdf" ? importPdf(file) : importEpub(file);
}
