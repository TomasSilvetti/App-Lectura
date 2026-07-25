// Genera un PDF y un EPUB en inglés para probar el lector de punta a punta.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "fixtures");

const PAGES = [
  [
    "The morning light came through the window and touched the wooden floor.",
    "Sarah opened the heavy book and started reading the first chapter slowly.",
    "Outside, the children were running across the garden, laughing loudly.",
    "She wondered whether the weather would hold until the evening arrived.",
  ],
  [
    "The old lighthouse stood quietly above the restless waves of the harbour.",
    "Every night its beam swept across the water, guiding the fishing boats home.",
    "The keeper wrote careful notes about the wind, the tides and the passing ships.",
    "Nobody remembered exactly when the lighthouse had been built.",
  ],
];

async function makePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);

  for (const lines of PAGES) {
    const page = pdf.addPage([595, 842]);
    let y = 760;
    for (const line of lines) {
      page.drawText(line, {
        x: 60,
        y,
        size: 16,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 40;
    }
  }

  pdf.setTitle("A Quiet Morning");
  await writeFile(join(outDir, "sample.pdf"), await pdf.save());
}

function chapterXhtml(title, lines) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head>
<body><h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join("")}</body></html>`;
}

async function makeEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:lectura-sample</dc:identifier>
    <dc:title>The Lighthouse Keeper</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`,
  );

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Índice</title></head>
<body><nav epub:type="toc" id="toc"><ol>
  <li><a href="chapter1.xhtml">A Quiet Morning</a></li>
  <li><a href="chapter2.xhtml">The Lighthouse</a></li>
</ol></nav></body></html>`,
  );

  zip.file("OEBPS/chapter1.xhtml", chapterXhtml("A Quiet Morning", PAGES[0]));
  zip.file("OEBPS/chapter2.xhtml", chapterXhtml("The Lighthouse", PAGES[1]));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await writeFile(join(outDir, "sample.epub"), buffer);
}

await mkdir(outDir, { recursive: true });
await makePdf();
await makeEpub();
console.log("Fixtures generados en e2e/fixtures");
