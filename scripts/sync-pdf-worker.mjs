import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// El worker de pdf.js tiene que servirse como archivo estático y su versión
// debe coincidir exactamente con la de la librería, así que se copia desde
// node_modules en cada instalación en vez de versionarlo a mano.
const require = createRequire(import.meta.url);
const source = join(
  dirname(require.resolve("pdfjs-dist/package.json")),
  "build",
  "pdf.worker.min.mjs",
);
const target = join(process.cwd(), "public", "pdf.worker.min.mjs");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log("pdf.worker.min.mjs actualizado en /public");
