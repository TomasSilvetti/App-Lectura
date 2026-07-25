// Rasteriza los SVG a los PNG que exigen los navegadores para poder instalar
// la app. Chrome pide 192 y 512; iOS solo entiende PNG para el ícono de la
// pantalla de inicio. Se corre a mano y el resultado se versiona.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const publicDir = join(process.cwd(), "public");

const icon = await readFile(join(publicDir, "icon.svg"));
const maskable = await readFile(join(publicDir, "icon-maskable.svg"));

const targets = [
  { source: icon, size: 192, name: "icon-192.png" },
  { source: icon, size: 512, name: "icon-512.png" },
  { source: icon, size: 180, name: "apple-touch-icon.png" },
  { source: maskable, size: 512, name: "icon-maskable-512.png" },
];

for (const { source, size, name } of targets) {
  const png = await sharp(source, { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(join(publicDir, name), png);
  console.log(`${name} (${size}×${size}) — ${png.length} bytes`);
}
