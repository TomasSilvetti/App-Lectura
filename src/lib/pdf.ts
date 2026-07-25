import type * as PdfjsModule from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

let pdfjsPromise: Promise<typeof PdfjsModule> | null = null;

/**
 * pdf.js solo funciona en el navegador y necesita su worker servido como
 * archivo estático. La copia en /public la genera `npm run sync-pdf-worker`.
 */
export function getPdfjs(): Promise<typeof PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export interface OpenPdf {
  doc: PDFDocumentProxy;
  /** Libera el documento y su worker. El documento solo no sabe cerrarse. */
  close: () => void;
}

/** pdf.js se queda con el ArrayBuffer que recibe, así que siempre va una copia. */
export async function openPdf(data: ArrayBuffer): Promise<OpenPdf> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: data.slice(0) });
  const doc = await loadingTask.promise;
  return {
    doc,
    close: () => {
      void loadingTask.destroy();
    },
  };
}
